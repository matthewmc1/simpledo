import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { subtask, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import { UpdateSubtaskInputSchema } from "../../shared/types";

const router = new Hono<Env>();

/** Returns the subtask's parent taskId iff it belongs to the user; 404s otherwise. */
async function resolveParent(subtaskId: string, userId: string): Promise<string> {
  const rows = await db
    .select({ taskId: subtask.taskId })
    .from(subtask)
    .innerJoin(task, eq(task.id, subtask.taskId))
    .where(and(eq(subtask.id, subtaskId), eq(task.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new HTTPError(404, "Subtask not found");
  return rows[0].taskId;
}

router.patch("/subtasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpdateSubtaskInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid subtask update");
  if (Object.keys(parsed.data).length === 0) throw new HTTPError(400, "No fields to update");

  const parentId = await resolveParent(id, user.id);

  const rows = await db
    .update(subtask)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(subtask.id, id))
    .returning({
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      done: subtask.done,
      createdAt: subtask.createdAt,
      updatedAt: subtask.updatedAt,
    });

  // Bump parent so detail-view "Updated" reflects the change.
  await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, parentId));

  return c.json({ subtask: rows[0] });
});

router.delete("/subtasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const parentId = await resolveParent(id, user.id);
  await db.delete(subtask).where(eq(subtask.id, id));
  await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, parentId));
  return c.json({ ok: true });
});

export const subtaskRoutes = router;
