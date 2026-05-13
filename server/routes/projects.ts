import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { project } from "../db/schema";
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

router.delete("/projects/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const rows = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, user.id)))
    .returning({ id: project.id });
  if (rows.length === 0) throw new HTTPError(404, "Project not found");
  return c.json({ ok: true });
});

export const projectRoutes = router;
