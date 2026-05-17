import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
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

router.get("/tasks", async (c) => {
  const user = requireUser(c);
  const parsed = TasksQuerySchema.safeParse({ status: c.req.query("status") });
  if (!parsed.success) throw new HTTPError(400, "Invalid query: status must be a valid status");
  const { status } = parsed.data;

  const where = status
    ? and(eq(task.userId, user.id), eq(task.status, status))
    : eq(task.userId, user.id);

  const tasks = await db
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
      clientDescription: task.clientDescription,
      integration: task.integration,
      integrationId: task.integrationId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })
    .from(task)
    .where(where)
    .orderBy(task.createdAt);

  // One query for all subtasks across the page.
  const taskIds = tasks.map((t) => t.id);
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

  const result = tasks.map((t) => ({ ...t, subtasks: byTask.get(t.id) ?? [] }));
  return c.json({ tasks: result });
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

  const updates = {
    ...parsed.data,
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
