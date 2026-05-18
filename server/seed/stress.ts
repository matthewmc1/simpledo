/**
 * Stress seeder for the scaling demo.
 *
 * Usage:
 *   npm run seed:stress -- --email=stress@local.dev
 *   npm run seed:stress -- --email=stress@local.dev --tasks=1000000
 *
 * Creates (or reuses) a user with the given email and bulk-inserts:
 *   - ~150 projects
 *   - ~30 releases per project (semver)
 *   - N tasks (default 100k, configurable up to ~1M)
 *   - ~5k inbox items
 *
 * Idempotent per email: existing tasks/projects/releases/inbox for that user
 * are wiped first so re-running gives a clean slate.
 *
 * Inserts are batched (~2k rows per round-trip) — bounded by Postgres's
 * parameter limit (~65535 placeholders). On a local Docker Postgres this
 * runs at roughly 25k tasks/sec.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  inboxItem,
  project,
  release,
  task,
  user as userTable,
} from "../db/schema";

interface Args {
  email: string;
  taskCount: number;
  projectCount: number;
  inboxCount: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : undefined;
  };
  const email = get("email");
  if (!email) {
    console.error("Usage: npm run seed:stress -- --email=<email> [--tasks=100000] [--projects=150]");
    process.exit(1);
  }
  return {
    email: email.toLowerCase().trim(),
    taskCount: Number(get("tasks") ?? "100000"),
    projectCount: Number(get("projects") ?? "150"),
    inboxCount: Number(get("inbox") ?? "5000"),
  };
}

// Deterministic-ish PRNG so output is varied but the same across runs.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const COLORS = [
  "#a85a2c",
  "#2d5a3d",
  "#5a3da8",
  "#3d4a8a",
  "#b8843d",
  "#807d72",
  "#2d7a4c",
  "#a8442c",
  "#5a4a2c",
];

const PROJECT_NAME_PARTS = {
  prefix: [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    "FY26",
    "FY27",
    "Atlas",
    "Beacon",
    "Compass",
    "Drift",
    "Echo",
    "Forge",
    "Glacier",
    "Horizon",
    "Indigo",
    "Juno",
    "Krypton",
    "Lumen",
    "Meridian",
    "Nimbus",
  ],
  noun: [
    "Retention",
    "Onboarding",
    "Platform",
    "Payments",
    "Mobile",
    "API",
    "Insights",
    "Compliance",
    "Search",
    "Identity",
    "Trust",
    "Growth",
    "Inbox",
    "Notifications",
    "Reporting",
    "Migration",
    "Pricing",
    "Billing",
    "Workflows",
    "Sandbox",
  ],
  suffix: [
    "Initiative",
    "Rollout",
    "Migration",
    "Spike",
    "Hardening",
    "Cleanup",
    "Rewrite",
    "Refactor",
    "Audit",
    "Sunset",
    "Refresh",
    "Bootstrap",
    "Refinement",
    "Hardening",
    "Push",
    "Plan",
    "Sprint",
  ],
};

const TASK_VERBS = [
  "Ship",
  "Wire up",
  "Refactor",
  "Decide on",
  "Write",
  "Review",
  "Triage",
  "Sketch",
  "Spec",
  "Investigate",
  "Migrate",
  "Tune",
  "Audit",
  "Profile",
  "Document",
  "Patch",
  "Pair on",
  "Test",
  "Deploy",
  "Roll back",
  "Backfill",
  "Reconcile",
  "Land",
  "Draft",
];

const TASK_NOUNS = [
  "the dashboard",
  "the new schema",
  "the cohort export",
  "the changelog",
  "the partner contract",
  "the runbook",
  "the metrics pipeline",
  "the access policy",
  "the failover plan",
  "the offboarding flow",
  "the staging env",
  "the cron job",
  "the seed migration",
  "the cache layer",
  "the rate-limit fix",
  "the OAuth scope",
  "the changelog template",
  "the support macros",
  "the deprecation notice",
];

const STATUSES = ["inbox", "today", "next", "waiting", "someday", "done"] as const;
const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

/** Weighted status distribution roughly matching a real GTD library:
 *  most history is `done`, a thin top of `today`, plenty of `next`/`someday`. */
function pickStatus(rng: () => number): (typeof STATUSES)[number] {
  const n = rng();
  if (n < 0.6) return "done";
  if (n < 0.75) return "next";
  if (n < 0.83) return "someday";
  if (n < 0.88) return "today";
  if (n < 0.93) return "waiting";
  return "inbox";
}

function pickPriority(rng: () => number): (typeof PRIORITIES)[number] {
  const n = rng();
  if (n < 0.1) return "P1";
  if (n < 0.35) return "P2";
  if (n < 0.75) return "P3";
  return "P4";
}

function pickFrom<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Postgres caps prepared statement parameters at 65,535 (Drizzle uses the
// node-postgres driver which inherits this). Each row uses ~12 columns for
// task — we keep ~3000 rows per insert as a safety margin.
const TASK_BATCH = 3000;
const INBOX_BATCH = 4000;

async function clearUserData(userId: string) {
  // task is FK'd from subtask, so deleting tasks cascades correctly.
  // release is FK'd from project, similarly.
  await db.delete(task).where(eq(task.userId, userId));
  await db.delete(project).where(eq(project.userId, userId));
  await db.delete(inboxItem).where(eq(inboxItem.userId, userId));
  // user row stays — preserves any Better Auth account linkages.
}

async function upsertUser(email: string): Promise<string> {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = crypto.randomUUID();
  const name = email.split("@")[0] || email;
  await db.insert(userTable).values({
    id,
    name,
    email,
    emailVerified: false,
    isDemo: false,
  });
  return id;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[stress-seed] user=${args.email}  projects=${args.projectCount}  tasks=${args.taskCount}  inbox=${args.inboxCount}`,
  );
  const t0 = Date.now();

  const userId = await upsertUser(args.email);
  console.log(`[stress-seed] user id ${userId}`);

  console.log("[stress-seed] wiping existing data for this user…");
  await clearUserData(userId);

  const rng = makeRng(42);

  // ── Projects ─────────────────────────────────────────────────────────────
  console.log(`[stress-seed] creating ${args.projectCount} projects…`);
  const projectIds: string[] = [];
  const projectRows = Array.from({ length: args.projectCount }, () => {
    const name =
      rng() < 0.3
        ? `${pickFrom(rng, PROJECT_NAME_PARTS.noun)} ${pickFrom(rng, PROJECT_NAME_PARTS.suffix)}`
        : `${pickFrom(rng, PROJECT_NAME_PARTS.prefix)} ${pickFrom(rng, PROJECT_NAME_PARTS.noun)}`;
    return {
      userId,
      name,
      color: pickFrom(rng, COLORS),
      description: rng() < 0.6 ? `Owner: ${name}. Tracking ${pickFrom(rng, TASK_NOUNS)}.` : "",
      archived: rng() < 0.1, // 10% archived
    };
  });
  // Project rows are few — single insert is fine.
  const insertedProjects = await db.insert(project).values(projectRows).returning({ id: project.id });
  projectIds.push(...insertedProjects.map((p) => p.id));

  // ── Releases (semver, ~30 per project on average, capped at 50) ─────────
  console.log("[stress-seed] creating releases…");
  const releaseRowsByProject = new Map<string, { id: string; pid: string }[]>();
  const allReleaseRows: typeof release.$inferInsert[] = [];
  for (const pid of projectIds) {
    const releaseCount = Math.floor(rng() * 50);
    for (let i = 0; i < releaseCount; i++) {
      // Build a monotonic semver chain.
      const major = Math.floor(i / 25);
      const minor = Math.floor((i % 25) / 5);
      const patch = i % 5;
      allReleaseRows.push({
        projectId: pid,
        version: `${major}.${minor}.${patch}`,
        name: rng() < 0.4 ? pickFrom(rng, PROJECT_NAME_PARTS.suffix) : null,
        notes: "",
        releasedAt:
          rng() < 0.6
            ? new Date(Date.now() - Math.floor(rng() * 365 * 24 * 60 * 60 * 1000))
            : null, // 60% released, 40% planned
      });
    }
  }
  // Releases are 1-50 per project. Batch in 4k chunks.
  for (let i = 0; i < allReleaseRows.length; i += 4000) {
    const slice = allReleaseRows.slice(i, i + 4000);
    const inserted = await db.insert(release).values(slice).returning({
      id: release.id,
      projectId: release.projectId,
    });
    for (const r of inserted) {
      const arr = releaseRowsByProject.get(r.projectId) ?? [];
      arr.push({ id: r.id, pid: r.projectId });
      releaseRowsByProject.set(r.projectId, arr);
    }
  }
  console.log(`[stress-seed]   ${allReleaseRows.length} releases created`);

  // ── Tasks ────────────────────────────────────────────────────────────────
  console.log(`[stress-seed] creating ${args.taskCount.toLocaleString()} tasks (batched)…`);
  const now = Date.now();
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  let inserted = 0;
  const batchStart = Date.now();

  for (let batch = 0; batch < args.taskCount; batch += TASK_BATCH) {
    const size = Math.min(TASK_BATCH, args.taskCount - batch);
    const rows: typeof task.$inferInsert[] = [];
    for (let i = 0; i < size; i++) {
      const status = pickStatus(rng);
      const priority = pickPriority(rng);
      const hasProject = rng() < 0.7;
      const projectId = hasProject ? pickFrom(rng, projectIds) : null;
      const projectReleases = projectId ? releaseRowsByProject.get(projectId) ?? [] : [];
      const releaseId =
        projectReleases.length > 0 && rng() < 0.4
          ? pickFrom(rng, projectReleases).id
          : null;
      // Bias `due` to a ±90-day window around now so calendar views feel
      // alive when navigating week-to-week.
      const hasDue = rng() < 0.7;
      let due: Date | null = null;
      let dueText: string | null = null;
      if (hasDue) {
        const offsetDays = Math.floor((rng() - 0.5) * 180);
        due = new Date(now + offsetDays * 24 * 60 * 60 * 1000);
        if (offsetDays === 0) dueText = "Today";
        else if (offsetDays === 1) dueText = "Tomorrow";
        else if (offsetDays === -1) dueText = "Yesterday";
        else
          dueText = due.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
      }
      // Spread createdAt across the past year so cursor pagination tests
      // against a realistic distribution.
      const createdAt = new Date(now - Math.floor(rng() * YEAR_MS));
      const updatedAt = new Date(
        createdAt.getTime() + Math.floor(rng() * (now - createdAt.getTime())),
      );
      rows.push({
        userId,
        title: `${pickFrom(rng, TASK_VERBS)} ${pickFrom(rng, TASK_NOUNS)}`,
        notes: rng() < 0.15 ? "Auto-generated stress-seed note." : "",
        priority,
        status,
        due,
        dueText,
        projectId,
        releaseId,
        clientDescription: releaseId && rng() < 0.4 ? `Customer-facing change.` : "",
        createdAt,
        updatedAt,
      });
    }
    await db.insert(task).values(rows);
    inserted += size;
    if (inserted % (TASK_BATCH * 10) === 0 || inserted === args.taskCount) {
      const elapsed = (Date.now() - batchStart) / 1000;
      const rate = inserted / elapsed;
      console.log(
        `[stress-seed]   ${inserted.toLocaleString()} / ${args.taskCount.toLocaleString()} ` +
          `· ${rate.toFixed(0)} rows/sec · ${elapsed.toFixed(1)}s elapsed`,
      );
    }
  }

  // ── Inbox items ──────────────────────────────────────────────────────────
  console.log(`[stress-seed] creating ${args.inboxCount.toLocaleString()} inbox items…`);
  for (let batch = 0; batch < args.inboxCount; batch += INBOX_BATCH) {
    const size = Math.min(INBOX_BATCH, args.inboxCount - batch);
    const rows = Array.from({ length: size }, () => ({
      userId,
      text: `${pickFrom(rng, TASK_VERBS)} ${pickFrom(rng, TASK_NOUNS)}`,
      source: pickFrom(rng, ["manual", "gmail", "slack", "linear"]),
      capturedAt: new Date(now - Math.floor(rng() * 30 * 24 * 60 * 60 * 1000)),
    }));
    await db.insert(inboxItem).values(rows);
  }

  // Postgres needs fresh statistics after a bulk insert or the planner will
  // pick a sub-optimal index until autovacuum catches up. Running ANALYZE
  // here makes every query use the correct index immediately.
  console.log("[stress-seed] running ANALYZE so the planner picks the right indexes…");
  await db.execute(sql`ANALYZE task`);
  await db.execute(sql`ANALYZE project`);
  await db.execute(sql`ANALYZE release`);
  await db.execute(sql`ANALYZE inbox_item`);

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[stress-seed] done in ${seconds}s.`);
  console.log(
    `[stress-seed] sign in with email "${args.email}" via the /api/auth/email endpoint to explore.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[stress-seed] failed:", e);
  process.exit(1);
});
