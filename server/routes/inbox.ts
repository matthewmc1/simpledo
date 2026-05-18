import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboxItem, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import {
  CaptureInputSchema,
  ProcessInputSchema,
  type ProcessDestination,
} from "../../shared/types";

const router = new Hono<Env>();

router.get("/inbox", async (c) => {
  const user = requireUser(c);
  const items = await db
    .select({
      id: inboxItem.id,
      text: inboxItem.text,
      source: inboxItem.source,
      fromLabel: inboxItem.fromLabel,
      capturedAt: inboxItem.capturedAt,
      createdAt: inboxItem.createdAt,
    })
    .from(inboxItem)
    .where(eq(inboxItem.userId, user.id))
    .orderBy(inboxItem.capturedAt);

  return c.json({ items });
});

router.post("/inbox", async (c) => {
  const user = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = CaptureInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid capture");

  const [row] = await db
    .insert(inboxItem)
    .values({
      userId: user.id,
      text: parsed.data.text.trim(),
      source: parsed.data.source ?? "manual",
    })
    .returning({
      id: inboxItem.id,
      text: inboxItem.text,
      source: inboxItem.source,
      fromLabel: inboxItem.fromLabel,
      capturedAt: inboxItem.capturedAt,
      createdAt: inboxItem.createdAt,
    });

  return c.json({ item: row });
});

router.delete("/inbox/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const rows = await db
    .delete(inboxItem)
    .where(and(eq(inboxItem.id, id), eq(inboxItem.userId, user.id)))
    .returning({ id: inboxItem.id });
  if (rows.length === 0) throw new HTTPError(404, "Inbox item not found");
  return c.json({ ok: true });
});

/** Convert an inbox item to a task (or delete it without conversion). */
router.post("/inbox/:id/process", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = ProcessInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid process payload");
  const { destination, priority, projectId } = parsed.data;

  const [existing] = await db
    .select({ id: inboxItem.id, text: inboxItem.text })
    .from(inboxItem)
    .where(and(eq(inboxItem.id, id), eq(inboxItem.userId, user.id)))
    .limit(1);
  if (!existing) throw new HTTPError(404, "Inbox item not found");

  if (destination === "delete") {
    await db.delete(inboxItem).where(eq(inboxItem.id, id));
    return c.json({ deleted: true });
  }

  const status: Exclude<ProcessDestination, "delete"> = destination;
  const [created] = await db
    .insert(task)
    .values({
      userId: user.id,
      title: existing.text,
      status,
      priority: priority ?? "P3",
      projectId: projectId ?? null,
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
      kind: task.kind,
      isRegression: task.isRegression,
      regressionOfReleaseId: task.regressionOfReleaseId,
      integration: task.integration,
      integrationId: task.integrationId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });

  await db.delete(inboxItem).where(eq(inboxItem.id, id));

  return c.json({ task: { ...created, subtasks: [] as unknown[] } });
});

export const inboxRoutes = router;
