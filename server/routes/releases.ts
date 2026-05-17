import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { project, release, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import {
  CreateReleaseInputSchema,
  UpdateReleaseInputSchema,
} from "../../shared/types";

const router = new Hono<Env>();

const RELEASE_COLS = {
  id: release.id,
  projectId: release.projectId,
  version: release.version,
  name: release.name,
  notes: release.notes,
  releasedAt: release.releasedAt,
  createdAt: release.createdAt,
  updatedAt: release.updatedAt,
} as const;

/** Parses MAJOR.MINOR.PATCH into a sortable tuple. Returns null if malformed
 *  — the Zod schema already prevents that on the way in. */
function semverTuple(version: string): [number, number, number] {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const [aM, aN, aP] = semverTuple(a);
  const [bM, bN, bP] = semverTuple(b);
  if (aM !== bM) return aM - bM;
  if (aN !== bN) return aN - bN;
  return aP - bP;
}

/** Confirms the project belongs to the user. */
async function assertProjectOwner(projectId: string, userId: string): Promise<void> {
  const rows = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new HTTPError(404, "Project not found");
}

/** Confirms the release belongs to a project owned by the user, and returns the projectId. */
async function assertReleaseOwner(releaseId: string, userId: string): Promise<string> {
  const rows = await db
    .select({ id: release.id, projectId: release.projectId })
    .from(release)
    .innerJoin(project, eq(project.id, release.projectId))
    .where(and(eq(release.id, releaseId), eq(project.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new HTTPError(404, "Release not found");
  return rows[0].projectId;
}

/** GET all releases for a project, semver-ascending. */
router.get("/projects/:projectId/releases", async (c) => {
  const user = requireUser(c);
  const projectId = c.req.param("projectId");
  await assertProjectOwner(projectId, user.id);

  const rows = await db
    .select(RELEASE_COLS)
    .from(release)
    .where(eq(release.projectId, projectId));
  const sorted = [...rows].sort((a, b) => compareSemver(a.version, b.version));
  return c.json({ releases: sorted });
});

/** Create a release under a project. */
router.post("/projects/:projectId/releases", async (c) => {
  const user = requireUser(c);
  const projectId = c.req.param("projectId");
  await assertProjectOwner(projectId, user.id);

  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = CreateReleaseInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid release input");

  // Reject duplicate versions within a project.
  const existing = await db
    .select({ id: release.id })
    .from(release)
    .where(and(eq(release.projectId, projectId), eq(release.version, parsed.data.version)))
    .limit(1);
  if (existing.length > 0) {
    throw new HTTPError(409, `Version ${parsed.data.version} already exists in this project`);
  }

  const [created] = await db
    .insert(release)
    .values({
      projectId,
      version: parsed.data.version,
      name: parsed.data.name ?? null,
      notes: parsed.data.notes ?? "",
      releasedAt: parsed.data.releasedAt ? new Date(parsed.data.releasedAt) : null,
    })
    .returning(RELEASE_COLS);

  return c.json({ release: created });
});

router.patch("/releases/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const projectId = await assertReleaseOwner(id, user.id);

  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpdateReleaseInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Invalid release update");
  if (Object.keys(parsed.data).length === 0) throw new HTTPError(400, "No fields to update");

  // If they're changing the version, guard against duplicates within the project.
  if (parsed.data.version) {
    const existing = await db
      .select({ id: release.id })
      .from(release)
      .where(and(eq(release.projectId, projectId), eq(release.version, parsed.data.version)))
      .limit(1);
    if (existing.length > 0 && existing[0].id !== id) {
      throw new HTTPError(409, `Version ${parsed.data.version} already exists in this project`);
    }
  }

  const updates = {
    ...parsed.data,
    releasedAt:
      parsed.data.releasedAt === undefined
        ? undefined
        : parsed.data.releasedAt === null
          ? null
          : new Date(parsed.data.releasedAt),
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(release)
    .set(updates)
    .where(eq(release.id, id))
    .returning(RELEASE_COLS);
  return c.json({ release: updated });
});

router.delete("/releases/:id", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  await assertReleaseOwner(id, user.id);
  await db.delete(release).where(eq(release.id, id));
  return c.json({ ok: true });
});

/** Markdown changelog compiled from the release's tasks. Client-facing text
 *  comes from each task's `client_description`, with `title` as the fallback. */
router.get("/releases/:id/changelog", async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  await assertReleaseOwner(id, user.id);

  const [rel] = await db.select(RELEASE_COLS).from(release).where(eq(release.id, id));
  if (!rel) throw new HTTPError(404, "Release not found");

  const tasks = await db
    .select({
      id: task.id,
      title: task.title,
      clientDescription: task.clientDescription,
      status: task.status,
      priority: task.priority,
    })
    .from(task)
    .where(eq(task.releaseId, id))
    .orderBy(task.priority, task.createdAt);

  const date = rel.releasedAt
    ? new Date(rel.releasedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unreleased";
  const heading = `# ${rel.version}${rel.name ? ` — ${rel.name}` : ""}`;
  const meta = `_${date}_`;

  const lines: string[] = [heading, "", meta];
  if (rel.notes.trim()) {
    lines.push("", rel.notes.trim());
  }
  lines.push("", "## What's new");
  if (tasks.length === 0) {
    lines.push("", "_No items in this release yet._");
  } else {
    for (const t of tasks) {
      const body = t.clientDescription.trim() || t.title;
      lines.push(`- ${body}`);
    }
  }
  const markdown = lines.join("\n") + "\n";

  // Allow ?format=md for direct text response; default returns JSON so the
  // client can render a Copy button.
  if (c.req.query("format") === "md") {
    return new Response(markdown, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }
  return c.json({ release: rel, markdown });
});

export const releaseRoutes = router;
