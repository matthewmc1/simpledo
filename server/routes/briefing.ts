import { Hono } from "hono";
import { and, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
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
    .orderBy(task.createdAt)
    .limit(40);

  const inbox = await db
    .select({
      text: inboxItem.text,
      source: inboxItem.source,
      fromLabel: inboxItem.fromLabel,
    })
    .from(inboxItem)
    .where(eq(inboxItem.userId, user.id))
    .orderBy(inboxItem.capturedAt)
    .limit(40);

  const prompt = buildPrompt(tasks, inbox);
  return streamFromOllama(prompt, 0.4);
});

interface ReviewTask {
  title: string;
  priority: string;
  status?: string;
  projectName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReviewProject {
  name: string;
  doneCount: number;
  openCount: number;
  /** Days since the most-recently-updated task in this project. Project-level
   *  signal — individual tasks have their own ages on their own lines. */
  daysSinceLastTaskUpdate: number | null;
}

/** Renders "today" or "Nd old" from a Date, for prompt clarity. */
function ageLabel(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "1d old";
  return `${days}d old`;
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
            ` — [${t.priority}], completed ${ageLabel(t.updatedAt)}`,
        )
        .join("\n")
    : "(nothing completed this week)";

  const staleLines = stale.length
    ? stale
        .map(
          (t, i) =>
            `${i + 1}. ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — task last updated ${ageLabel(t.updatedAt)}, task added ${ageLabel(t.createdAt)}`,
        )
        .join("\n")
    : "(nothing stale)";

  const projectLines = projects.length
    ? projects
        .map(
          (p) =>
            `- ${p.name}: ${p.doneCount} done, ${p.openCount} open` +
            (p.daysSinceLastTaskUpdate !== null
              ? `; project's most recent task activity: ${p.daysSinceLastTaskUpdate}d ago`
              : ""),
        )
        .join("\n")
    : "(no projects)";

  const upcomingLines = upcoming.length
    ? upcoming
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — status ${t.status ?? "(unknown)"}, task added ${ageLabel(t.createdAt)}`,
        )
        .join("\n")
    : "(none queued)";

  return `You are a calm, specific reviewer writing a short weekly narrative the user can paste into a status update or performance review. Reference projects and tasks by name. Don't invent items. Don't use bullet points or markdown.

WINS THIS WEEK (tasks completed in the last 7 days):
${winLines}

STALE ITEMS (active tasks not touched in 14+ days):
${staleLines}

PROJECT ACTIVITY (project-level rollups — these numbers describe whole projects, not individual tasks):
${projectLines}

ON DECK FOR NEXT WEEK (Today / Next / Waiting / Someday — items still open):
${upcomingLines}

IMPORTANT — task age vs project age:
- A task's age is what's printed on the task's own line ("task added today", "task last updated 14d old").
- A project's "most recent task activity: Nd ago" is a project-level metric and may include older tasks that have nothing to do with the task you're discussing.
- Never claim a specific task has been open for N days based on the project rollup. If a task was added today, say so. If a brand-new task lives inside an old project, say the task is new even if the project is older.

Write the weekly review in EXACTLY this format and NOTHING else. No preamble, no quotes, no markdown:

RECAP: <three to four sentences in first-person plural ("we") describing what actually moved this week. Lead with the most meaningful win. Reference specific projects and tasks above. Acknowledge what stalled if it matters. Tone: confident but not cheerleading. Suitable for pasting into a status update or weekly write-up.>
FOCUS: <two to three sentences in first-person plural describing what we're prioritising next week and why. Anchor each priority to a concrete project or task from the data above. When mentioning a task's age, use the age shown on that task's own line — not the project's rollup figure. Mention any stale items that need a decision.>

Do not output anything before RECAP or after the FOCUS section.`;
}

/** Streams a freshly-generated weekly review as Ollama-style NDJSON. */
router.post("/review", async (c) => {
  const user = requireUser(c);
  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS);
  const twoWeeksAgo = new Date(now - TWO_WEEK_MS);

  // Wins: tasks completed in the last 7 days. LIMIT 30 — the prompt only
  // references the top few; we don't need to hand-pick from a million rows.
  const wins = await db
    .select({
      title: task.title,
      priority: task.priority,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(and(eq(task.userId, user.id), eq(task.status, "done"), gte(task.updatedAt, weekAgo)))
    .orderBy(task.updatedAt)
    .limit(30);

  // Stale: open (non-inbox, non-done) tasks not touched in 14+ days.
  // Filter `status != inbox` at the SQL level + LIMIT 20.
  const staleRows = await db
    .select({
      title: task.title,
      priority: task.priority,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      status: task.status,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(
      and(
        eq(task.userId, user.id),
        lt(task.updatedAt, twoWeeksAgo),
        ne(task.status, "done"),
        ne(task.status, "inbox"),
      ),
    )
    .orderBy(task.updatedAt)
    .limit(20);
  const stale = staleRows.slice(0, 12);

  // Upcoming: open tasks (today/next/waiting/someday). Filter the four
  // statuses in SQL via `inArray` so we don't pull "done"/"inbox" rows we'd
  // discard. LIMIT 20.
  const upcomingRows = await db
    .select({
      title: task.title,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      projectName: project.name,
    })
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(
      and(
        eq(task.userId, user.id),
        inArray(task.status, ["today", "next", "waiting", "someday"]),
      ),
    )
    .orderBy(task.priority)
    .limit(20);
  const upcoming = upcomingRows.slice(0, 12);

  // Project activity rollup. Single grouped query rather than "load all
  // tasks, group in JS" — Postgres computes the aggregates and the result
  // set is one row per project regardless of how many tasks exist.
  const rollupRows = await db
    .select({
      projectId: task.projectId,
      doneCount:
        sql<number>`count(*) filter (where ${task.status} = 'done')`.mapWith(Number),
      totalCount: sql<number>`count(*)`.mapWith(Number),
      lastTaskUpdate: sql<Date | null>`max(${task.updatedAt})`,
    })
    .from(task)
    .where(eq(task.userId, user.id))
    .groupBy(task.projectId);

  const userProjects = await db
    .select({ id: project.id, name: project.name, updatedAt: project.updatedAt })
    .from(project)
    .where(and(eq(project.userId, user.id), eq(project.archived, false)));

  const rollupByProject = new Map(
    rollupRows
      .filter((r): r is typeof r & { projectId: string } => r.projectId !== null)
      .map((r) => [r.projectId, r]),
  );

  const projectRollups: ReviewProject[] = userProjects.map((p) => {
    const r = rollupByProject.get(p.id);
    const doneCount = r?.doneCount ?? 0;
    const totalCount = r?.totalCount ?? 0;
    const openCount = totalCount - doneCount;
    // For empty projects we fall back to the project's own updatedAt; otherwise
    // we use Postgres's `max(task.updatedAt)`. Either way this is the
    // *project-level* signal — see the prompt's "task age vs project age" note.
    const lastTouched =
      r?.lastTaskUpdate ? new Date(r.lastTaskUpdate).getTime() : new Date(p.updatedAt).getTime();
    const daysSinceLastTaskUpdate =
      lastTouched > 0 ? Math.round((now - lastTouched) / DAY_MS) : null;
    return { name: p.name, doneCount, openCount, daysSinceLastTaskUpdate };
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
  createdAt: Date;
}

function buildCalendarPrompt(
  scheduled: CalendarTask[],
  unscheduled: CalendarTask[],
  rangeLabel: string,
  todayLabel: string,
  futureDayLabels: string[],
): string {
  const schedLines = scheduled.length
    ? scheduled
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — due ${t.dueText ?? "(unset)"}, task added ${ageLabel(t.createdAt)}`,
        )
        .join("\n")
    : "(no scheduled items in this range)";

  const unschedLines = unscheduled.length
    ? unscheduled
        .map(
          (t, i) =>
            `${i + 1}. [${t.priority}] ${t.title}` +
            (t.projectName ? ` (${t.projectName})` : "") +
            ` — status ${t.status}, task added ${ageLabel(t.createdAt)}`,
        )
        .join("\n")
    : "(no unscheduled open tasks)";

  const futureList =
    futureDayLabels.length > 0
      ? futureDayLabels.join(", ")
      : "(no future days remain in this range)";

  return `You are a calm, specific planning assistant looking at the user's calendar for ${rangeLabel}.

TODAY: ${todayLabel}
DAYS AVAILABLE FOR NEW SUGGESTIONS (today + future days in this range only): ${futureList}

SCHEDULED IN THIS RANGE (tasks with a due date this period):
${schedLines}

UNSCHEDULED OPEN TASKS (today/next/waiting/someday with no due date):
${unschedLines}

STRICT RULES — read carefully before writing:
1. Only mention tasks and projects that appear by name in the lists above. Do NOT invent any task, project, codename, or initiative (e.g. "Project Phoenix", "pricing memo") — if it isn't in the lists, it doesn't exist.
2. Never suggest scheduling work on a day that has already passed. Stick to the DAYS AVAILABLE list above.
3. Don't invent ages — use only what's written on each task's own line.
4. If both task lists are empty, simply say there's nothing on the calendar yet and suggest capturing or scheduling a task — do not invent anything to recommend.

Write the recommendations in EXACTLY this format and NOTHING else. No preamble, no quotes, no markdown:

RECOMMEND: <two or three sentences in first-person plural ("we") describing how to play this period. Lead with what's already scheduled and the highest-leverage move. If an unscheduled task deserves a slot, name it (from the list above) and suggest one of the days in DAYS AVAILABLE. Be concrete — anchor every suggestion to a real task and an allowed day.>

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

  // Split into two indexed queries instead of "fetch everything, filter in
  // JS": one for the date range (uses task_user_due_idx) and one for the
  // unscheduled open set. Each is hard-capped at 20 rows.
  const COMMON_COLS = {
    title: task.title,
    priority: task.priority,
    status: task.status,
    due: task.due,
    dueText: task.dueText,
    createdAt: task.createdAt,
    projectName: project.name,
  };

  const inRange = await db
    .select(COMMON_COLS)
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(
      and(
        eq(task.userId, user.id),
        ne(task.status, "done"),
        gte(task.due, from),
        lte(task.due, to),
      ),
    )
    .orderBy(task.due)
    .limit(20);

  const unscheduled = await db
    .select(COMMON_COLS)
    .from(task)
    .leftJoin(project, eq(project.id, task.projectId))
    .where(
      and(
        eq(task.userId, user.id),
        isNull(task.due),
        inArray(task.status, ["today", "next", "waiting", "someday"]),
      ),
    )
    .limit(20);

  // Format a human range label like "Mon May 18 → Sun May 24".
  const rangeLabel = `${from.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} → ${to.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  // Both lists empty? Don't call the model — small LLMs invent items when
  // there's no signal. Stream a static answer in the same NDJSON shape so the
  // client parser is unchanged.
  if (inRange.length === 0 && unscheduled.length === 0) {
    return staticRecommendation(
      "Nothing on the calendar for this range yet. Capture or schedule a task to get started.",
    );
  }

  // Build a list of human-readable day labels that are today or future, so
  // the model can't suggest scheduling work on a day that has already passed.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const futureDayLabels: string[] = [];
  const dayCursor = new Date(from);
  dayCursor.setHours(0, 0, 0, 0);
  while (dayCursor <= to && futureDayLabels.length < 14) {
    if (dayCursor.getTime() >= todayStart.getTime()) {
      futureDayLabels.push(
        dayCursor.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
      );
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  const todayLabel = todayStart.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const prompt = buildCalendarPrompt(
    inRange,
    unscheduled,
    rangeLabel,
    todayLabel,
    futureDayLabels,
  );
  // Lower temperature reduces the hallucination rate noticeably for small
  // models like gemma3:4b.
  return streamFromOllama(prompt, 0.2);
});

/** Returns a one-shot NDJSON stream with the given text, matching the shape
 *  the client expects from Ollama. Used when we'd rather not call the model. */
function staticRecommendation(text: string): Response {
  const body = `RECOMMEND: ${text}`;
  const lines = [
    JSON.stringify({ response: body, done: false }),
    JSON.stringify({ done: true }),
  ].join("\n") + "\n";
  return new Response(body ? lines : "", {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache, no-transform",
    },
  });
}

export const briefingRoutes = router;
