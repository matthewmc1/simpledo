import { Hono } from "hono";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "../db/client";
import { env } from "../env";
import { inboxItem, project, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const TWO_WEEK_MS = 14 * DAY_MS;

const router = new Hono<Env>();

interface PromptTask {
  title: string;
  priority: string;
  projectName: string | null;
  dueText: string | null;
  integration: string | null;
}

interface PromptInbox {
  text: string;
  source: string;
  fromLabel: string | null;
}

function buildPrompt(tasks: PromptTask[], inbox: PromptInbox[]): string {
  const taskLines = tasks.length
    ? tasks
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            (t.dueText ? ` — due ${t.dueText}` : "") +
            (t.integration ? ` — from ${t.integration}` : ""),
        )
        .join("\n")
    : "(no tasks)";

  const inboxLines = inbox.length
    ? inbox
        .map(
          (i, idx) =>
            `${idx + 1}. ${i.text}` +
            (i.fromLabel ? ` (${i.fromLabel})` : ` (${i.source})`),
        )
        .join("\n")
    : "(empty)";

  return `You are a calm, terse productivity assistant reviewing the user's day for them.

TODAY'S TASKS:
${taskLines}

INBOX (unprocessed captures):
${inboxLines}

Write a daily briefing in EXACTLY this format and NOTHING else. No preamble, no quotes, no markdown:

HEADLINE: <one short sentence under 14 words, in sentence case, naming the day's main thrust>
SUMMARY: <one or two sentences naming the most important thing to do first and why, referring to specific tasks above>

Do not output anything before HEADLINE or after the SUMMARY line.`;
}

/** Posts the prompt to Ollama and returns the raw NDJSON stream. Shared by
 *  /briefing and /review so we have one place to handle Ollama errors. */
async function streamFromOllama(prompt: string, temperature: number): Promise<Response> {
  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${env.GEMMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: env.GEMMA_MODEL,
        prompt,
        stream: true,
        options: { temperature },
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new HTTPError(
      502,
      `Could not reach Gemma at ${env.GEMMA_BASE_URL}. Is Ollama running? (${msg})`,
    );
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    const text = await ollamaRes.text().catch(() => "");
    throw new HTTPError(
      502,
      `Gemma returned ${ollamaRes.status}: ${text || ollamaRes.statusText}`,
    );
  }

  return new Response(ollamaRes.body, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/** Streams a freshly-generated briefing as Ollama-style NDJSON. */
router.post("/briefing", async (c) => {
  const user = requireUser(c);

  const tasks = await db
    .select({
      title: task.title,
      priority: task.priority,
      dueText: task.dueText,
      integration: task.integration,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), eq(task.status, "today")))
    .orderBy(task.createdAt);

  const inbox = await db
    .select({
      text: inboxItem.text,
      source: inboxItem.source,
      fromLabel: inboxItem.fromLabel,
    })
    .from(inboxItem)
    .where(eq(inboxItem.userId, user.id))
    .orderBy(inboxItem.capturedAt);

  const prompt = buildPrompt(tasks, inbox);
  return streamFromOllama(prompt, 0.4);
});

interface ReviewTask {
  title: string;
  priority: string;
  projectName: string | null;
  updatedAt: Date;
}

interface ReviewProject {
  name: string;
  doneCount: number;
  openCount: number;
  staleDays: number | null;
}

function buildReviewPrompt(
  wins: ReviewTask[],
  stale: ReviewTask[],
  projects: ReviewProject[],
  upcoming: ReviewTask[],
): string {
  const winLines = wins.length
    ? wins
        .map(
          (t, i) =>
            `${i + 1}. ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — [${t.priority}]`,
        )
        .join("\n")
    : "(nothing completed this week)";

  const staleLines = stale.length
    ? stale
        .map(
          (t, i) =>
            `${i + 1}. ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — last touched ${Math.round((Date.now() - new Date(t.updatedAt).getTime()) / DAY_MS)}d ago`,
        )
        .join("\n")
    : "(nothing stale)";

  const projectLines = projects.length
    ? projects
        .map(
          (p) =>
            `- ${p.name}: ${p.doneCount} done, ${p.openCount} open` +
            (p.staleDays !== null ? `, last touched ${p.staleDays}d ago` : ""),
        )
        .join("\n")
    : "(no projects)";

  const upcomingLines = upcoming.length
    ? upcoming
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : ""),
        )
        .join("\n")
    : "(none queued)";

  return `You are a calm, specific reviewer writing a short weekly narrative the user can paste into a status update or performance review. Reference projects and tasks by name. Don't invent items. Don't use bullet points or markdown.

WINS THIS WEEK (tasks completed in the last 7 days):
${winLines}

STALE ITEMS (active tasks not touched in 14+ days):
${staleLines}

PROJECT ACTIVITY:
${projectLines}

ON DECK FOR NEXT WEEK (Today / Next / Waiting / Someday — items still open):
${upcomingLines}

Write the weekly review in EXACTLY this format and NOTHING else. No preamble, no quotes, no markdown:

RECAP: <three to four sentences in first-person plural ("we") describing what actually moved this week. Lead with the most meaningful win. Reference specific projects and tasks above. Acknowledge what stalled if it matters. Tone: confident but not cheerleading. Suitable for pasting into a status update or weekly write-up.>
FOCUS: <two to three sentences in first-person plural describing what we're prioritising next week and why. Anchor each priority to a concrete project or task from the data above. Mention any stale items that need a decision.>

Do not output anything before RECAP or after the FOCUS section.`;
}

/** Streams a freshly-generated weekly review as Ollama-style NDJSON. */
router.post("/review", async (c) => {
  const user = requireUser(c);
  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS);
  const twoWeeksAgo = new Date(now - TWO_WEEK_MS);

  // Wins: tasks completed in the last 7 days.
  const wins = await db
    .select({
      title: task.title,
      priority: task.priority,
      updatedAt: task.updatedAt,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), eq(task.status, "done"), gte(task.updatedAt, weekAgo)))
    .orderBy(task.updatedAt);

  // Stale: open (non-inbox, non-done) tasks not touched in 14+ days.
  const staleRows = await db
    .select({
      title: task.title,
      priority: task.priority,
      updatedAt: task.updatedAt,
      status: task.status,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), lt(task.updatedAt, twoWeeksAgo), ne(task.status, "done")))
    .orderBy(task.updatedAt);
  const stale = staleRows.filter((r) => r.status !== "inbox").slice(0, 12);

  // Upcoming: open tasks (today/next/waiting/someday) — what's queued for next week.
  const upcomingRows = await db
    .select({
      title: task.title,
      priority: task.priority,
      status: task.status,
      updatedAt: task.updatedAt,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), ne(task.status, "done")))
    .orderBy(task.priority);
  const upcoming = upcomingRows
    .filter((r) => r.status === "today" || r.status === "next" || r.status === "waiting" || r.status === "someday")
    .slice(0, 12);

  // Project activity rollup.
  const allTasksForRollup = await db
    .select({
      projectId: task.projectId,
      status: task.status,
      updatedAt: task.updatedAt,
    })
    .from(task)
    .where(eq(task.userId, user.id));

  const userProjects = await db
    .select({ id: project.id, name: project.name, updatedAt: project.updatedAt })
    .from(project)
    .where(and(eq(project.userId, user.id), eq(project.archived, false)));

  const projectRollups: ReviewProject[] = userProjects.map((p) => {
    const own = allTasksForRollup.filter((t) => t.projectId === p.id);
    const doneCount = own.filter((t) => t.status === "done").length;
    const openCount = own.length - doneCount;
    const lastTouched = own.length > 0
      ? Math.max(...own.map((t) => new Date(t.updatedAt).getTime()))
      : new Date(p.updatedAt).getTime();
    const staleDays = lastTouched > 0 ? Math.round((now - lastTouched) / DAY_MS) : null;
    return { name: p.name, doneCount, openCount, staleDays };
  });

  const prompt = buildReviewPrompt(wins, stale, projectRollups, upcoming);
  return streamFromOllama(prompt, 0.5);
});

interface CalendarTask {
  title: string;
  priority: string;
  status: string;
  dueText: string | null;
  projectName: string | null;
}

function buildCalendarPrompt(
  scheduled: CalendarTask[],
  unscheduled: CalendarTask[],
  rangeLabel: string,
): string {
  const schedLines = scheduled.length
    ? scheduled
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — due ${t.dueText ?? "(unset)"}`,
        )
        .join("\n")
    : "(no scheduled items in this range)";

  const unschedLines = unscheduled.length
    ? unscheduled
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — ${t.status}`,
        )
        .join("\n")
    : "(no unscheduled open tasks)";

  return `You are a calm, specific planning assistant looking at the user's calendar for ${rangeLabel}. Reference tasks and projects by name. Don't invent items.

SCHEDULED IN THIS RANGE (tasks with a due date this period):
${schedLines}

UNSCHEDULED OPEN TASKS (today/next/waiting/someday with no due date):
${unschedLines}

Write the recommendations in EXACTLY this format and NOTHING else. No preamble, no quotes, no markdown:

RECOMMEND: <two or three sentences in first-person plural ("we") describing how to play this period. Lead with what's already scheduled and the highest-leverage move. If unscheduled items deserve a slot, name them and suggest when (e.g. "consider blocking Wednesday morning for the pricing memo"). Be concrete — anchor every suggestion to a real task or day.>

Do not output anything before RECOMMEND or after the paragraph.`;
}

/** Streams calendar planning recommendations. The client passes ?from=ISO&to=ISO
 *  bracketing the visible range; otherwise we default to the next 7 days. */
router.post("/calendar/recommend", async (c) => {
  const user = requireUser(c);

  const fromParam = c.req.query("from");
  const toParam = c.req.query("to");
  const now = new Date();
  const from = fromParam ? new Date(fromParam) : now;
  const to = toParam ? new Date(toParam) : new Date(now.getTime() + WEEK_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new HTTPError(400, "Invalid from/to range");
  }

  const allTasks = await db
    .select({
      title: task.title,
      priority: task.priority,
      status: task.status,
      due: task.due,
      dueText: task.dueText,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), ne(task.status, "done")));

  const inRange = allTasks
    .filter((t) => t.due && new Date(t.due) >= from && new Date(t.due) <= to)
    .sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime())
    .slice(0, 20);

  const unscheduled = allTasks
    .filter((t) => !t.due && (t.status === "today" || t.status === "next" || t.status === "waiting" || t.status === "someday"))
    .slice(0, 20);

  // Format a human range label like "Mon May 18 → Sun May 24".
  const rangeLabel = `${from.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} → ${to.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  const prompt = buildCalendarPrompt(inRange, unscheduled, rangeLabel);
  return streamFromOllama(prompt, 0.5);
});

export const briefingRoutes = router;
