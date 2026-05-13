import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { subtask, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import { UpdateSubtaskInputSchema } from "../../shared/types";

const router = new Hono<Env>();

/** Confirms the subtask belongs to one of the user's tasks. */
async function assertOwnership(subtaskId: string, userId: string): Promise<void> {
  const rows = await db
    .select({ id: subtask.id })
    .from(subtask)
    .innerJoin(task, eq(task.id, subtask.taskId))
    .where(and(eq(subtask.id, subtaskId), eq(task.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new HTTPError(404, "Subtask not found");
}

router.patch("/subtasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpdateSubtaskInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid subtask update");
  if (Object.keys(parsed.data).length === 0) throw new HTTPError(400, "No fields to update");

  await assertOwnership(id, user.id);

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

  return c.json({ subtask: rows[0] });
});

router.delete("/subtasks/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  await assertOwnership(id, user.id);
  await db.delete(subtask).where(eq(subtask.id, id));
  return c.json({ ok: true });
});

export const subtaskRoutes = router;
