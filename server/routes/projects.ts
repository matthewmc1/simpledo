import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { project, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
} from "../../shared/types";

const router = new Hono<Env>();

const COLS = {
  id: project.id,
  name: project.name,
  color: project.color,
  description: project.description,
  source: project.source,
  archived: project.archived,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};

router.get("/projects", async (c) => {
  const user = requireUser(c);
  const rows = await db
    .select(COLS)
    .from(project)
    .where(and(eq(project.userId, user.id), eq(project.archived, false)))
    .orderBy(project.createdAt);

  return c.json({ projects: rows });
});

router.post("/projects", async (c) => {
  const user = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = CreateProjectInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid project input");

  const [row] = await db
    .insert(project)
    .values({
      userId: user.id,
      name: parsed.data.name.trim(),
      color: parsed.data.color ?? "#807d72",
      description: parsed.data.description ?? "",
    })
    .returning(COLS);

  return c.json({ project: row });
});

router.patch("/projects/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpdateProjectInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid project update");
  if (Object.keys(parsed.data).length === 0)
    throw new HTTPError(400, "No fields to update");

  const rows = await db
    .update(project)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(project.id, id), eq(project.userId, user.id)))
    .returning(COLS);
  if (rows.length === 0) throw new HTTPError(404, "Project not found");

  return c.json({ project: rows[0] });
});

/** Deletes the project AND all tasks belonging to it.
 *
 *  The `task.project_id` FK is `ON DELETE SET NULL` so deleting the project
 *  alone would orphan the tasks (lose their project tag) but keep them in
 *  the user's library. Per product spec, projects own their tasks — when
 *  the user removes a project they expect the tasks to go too. We do this
 *  at the application level (rather than changing FKs) so it's explicit and
 *  reversible: pass `?keepTasks=true` to recover the old "orphan, don't
 *  delete" behaviour.
 */
router.delete("/projects/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const keepTasks = c.req.query("keepTasks") === "true";

  // Ownership check first so we can return 404 cleanly even when there are
  // no tasks.
  const owned = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, user.id)))
    .limit(1);
  if (owned.length === 0) throw new HTTPError(404, "Project not found");

  let deletedTasks = 0;
  if (!keepTasks) {
    const taskRows = await db
      .delete(task)
      .where(and(eq(task.projectId, id), eq(task.userId, user.id)))
      .returning({ id: task.id });
    deletedTasks = taskRows.length;
  }

  await db.delete(project).where(eq(project.id, id));
  return c.json({ ok: true, deletedTasks });
});

export const projectRoutes = router;
