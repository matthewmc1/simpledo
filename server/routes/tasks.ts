import { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { subtask, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import {
  CreateSubtaskInputSchema,
  CreateTaskInputSchema,
  TasksQuerySchema,
  UpdateTaskInputSchema,
} from "../../shared/types";

const router = new Hono<Env>();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

router.get("/tasks", async (c) => {
  const user = requireUser(c);
  // Pull every supported query param. Zod normalises types (numbers from
  // strings, ISO date validation, etc.) and rejects unknowns cleanly.
  const parsed = TasksQuerySchema.safeParse({
    status: c.req.query("status"),
    projectId: c.req.query("projectId"),
    releaseId: c.req.query("releaseId"),
    dueFrom: c.req.query("dueFrom"),
    dueTo: c.req.query("dueTo"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  if (!parsed.success) throw new HTTPError(400, "Invalid task query");
  const q = parsed.data;
  const limit = Math.min(q.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // Build the WHERE incrementally. Each filter is index-backed.
  const conditions: SQL[] = [eq(task.userId, user.id)];
  if (q.status) conditions.push(eq(task.status, q.status));
  if (q.projectId === null) conditions.push(isNull(task.projectId));
  else if (q.projectId) conditions.push(eq(task.projectId, q.projectId));
  if (q.releaseId === null) conditions.push(isNull(task.releaseId));
  else if (q.releaseId) conditions.push(eq(task.releaseId, q.releaseId));
  if (q.dueFrom) conditions.push(gte(task.due, new Date(q.dueFrom)));
  if (q.dueTo) conditions.push(lte(task.due, new Date(q.dueTo)));
  // Cursor pagination by createdAt (descending). Stable since we sort newest-first.
  if (q.cursor) conditions.push(lt(task.createdAt, new Date(q.cursor)));

  // Fetch one extra row to know whether a next page exists. Drizzle's `.and(...conditions)`
  // is fine even when the list has a single condition.
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      due: task.due,
      dueText: task.dueText,
      projectId: task.projectId,
      releaseId: task.releaseId,
      previousReleaseId: task.previousReleaseId,
      clientDescription: task.clientDescription,
      integration: task.integration,
      integrationId: task.integrationId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })
    .from(task)
    .where(and(...conditions))
    .orderBy(desc(task.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  // Subtask fan-out is bounded by `limit` so the IN clause never explodes.
  const taskIds = page.map((t) => t.id);
  const subtasks = taskIds.length
    ? await db
        .select({
          id: subtask.id,
          taskId: subtask.taskId,
          title: subtask.title,
          done: subtask.done,
          createdAt: subtask.createdAt,
          updatedAt: subtask.updatedAt,
        })
        .from(subtask)
        .where(inArray(subtask.taskId, taskIds))
        .orderBy(subtask.createdAt)
    : [];

  const byTask = new Map<string, typeof subtasks>();
  for (const s of subtasks) {
    const arr = byTask.get(s.taskId);
    if (arr) arr.push(s);
    else byTask.set(s.taskId, [s]);
  }

  const result = page.map((t) => ({ ...t, subtasks: byTask.get(t.id) ?? [] }));
  return c.json({ tasks: result, nextCursor });
});

/** Postgres tsvector full-text search over title + notes + client_description.
 *  Index is `task_user_search_idx` (GIN on `search_tsv`). Returns a small
 *  result set ordered by rank — used by the ⌘P palette. */
router.get("/tasks/search", async (c) => {
  const user = requireUser(c);
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ tasks: [] });
  // `plainto_tsquery` accepts user input verbatim (no special syntax required)
  // and parameterises through Drizzle's `sql` template — no injection.
  const tsq = sql`plainto_tsquery('english', ${q})`;
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectId: task.projectId,
      dueText: task.dueText,
      // Rank scores recency-of-match higher than incidental hits.
      rank: sql<number>`ts_rank(search_tsv, ${tsq})`.mapWith(Number),
    })
    .from(task)
    .where(and(eq(task.userId, user.id), sql`search_tsv @@ ${tsq}`))
    .orderBy(sql`ts_rank(search_tsv, ${tsq}) DESC`, desc(task.updatedAt))
    .limit(20);
  return c.json({ tasks: rows });
});

router.post("/tasks", async (c) => {
  const user = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = CreateTaskInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid task input");
  const { title, status, priority, projectId, releaseId, notes, clientDescription } = parsed.data;

  const [created] = await db
    .insert(task)
    .values({
      userId: user.id,
      title: title.trim(),
      status: status ?? "today",
      priority: priority ?? "P3",
      projectId: projectId ?? null,
      releaseId: releaseId ?? null,
      notes: notes ?? "",
      clientDescription: clientDescription ?? "",
    })
    .returning({
      id: task.id,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      due: task.due,
      dueText: task.dueText,
      projectId: task.projectId,
      releaseId: task.releaseId,
      previousReleaseId: task.previousReleaseId,
      clientDescription: task.clientDescription,
      integration: task.integration,
      integrationId: task.integrationId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });

  return c.json({ task: { ...created, subtasks: [] as unknown[] } });
});

router.patch("/tasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpdateTaskInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid task update");
  if (Object.keys(parsed.data).length === 0) throw new HTTPError(400, "No fields to update");

  // If the caller is changing `releaseId`, auto-record where the task came
  // from so the release detail page can show "items that were originally
  // here but moved out". Skip when the new value equals the existing one
  // (no-op) — read the current row first.
  let previousReleaseUpdate: { previousReleaseId?: string | null } = {};
  if ("releaseId" in parsed.data) {
    const [current] = await db
      .select({ releaseId: task.releaseId })
      .from(task)
      .where(and(eq(task.id, id), eq(task.userId, user.id)))
      .limit(1);
    if (current && current.releaseId !== parsed.data.releaseId) {
      previousReleaseUpdate = { previousReleaseId: current.releaseId };
    }
  }

  const updates = {
    ...parsed.data,
    ...previousReleaseUpdate,
    // Convert ISO string back to Date for the timestamp column.
    due: parsed.data.due === undefined ? undefined : parsed.data.due === null ? null : new Date(parsed.data.due),
    updatedAt: new Date(),
  };

  const rows = await db
    .update(task)
    .set(updates)
    .where(and(eq(task.id, id), eq(task.userId, user.id)))
    .returning({
      id: task.id,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      due: task.due,
      dueText: task.dueText,
      projectId: task.projectId,
      releaseId: task.releaseId,
      previousReleaseId: task.previousReleaseId,
      clientDescription: task.clientDescription,
      integration: task.integration,
      integrationId: task.integrationId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  if (rows.length === 0) throw new HTTPError(404, "Task not found");

  return c.json({ task: { ...rows[0], subtasks: [] as unknown[] } });
});

router.post("/tasks/:taskId/subtasks", async (c) => {
  const user = requireUser(c);
  const taskId = c.req.param("taskId");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = CreateSubtaskInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid subtask input");

  // Confirm the task belongs to this user before adding a subtask.
  const [parent] = await db
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.userId, user.id)))
    .limit(1);
  if (!parent) throw new HTTPError(404, "Task not found");

  const [created] = await db
    .insert(subtask)
    .values({ taskId, title: parsed.data.title.trim() })
    .returning({
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      done: subtask.done,
      createdAt: subtask.createdAt,
      updatedAt: subtask.updatedAt,
    });

  // Bump the parent task's updatedAt so detail-view "Updated" reflects the change.
  await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, taskId));

  return c.json({ subtask: created });
});

router.delete("/tasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const rows = await db
    .delete(task)
    .where(and(eq(task.id, id), eq(task.userId, user.id)))
    .returning({ id: task.id });
  if (rows.length === 0) throw new HTTPError(404, "Task not found");
  return c.json({ ok: true });
});

export const taskRoutes = router;
