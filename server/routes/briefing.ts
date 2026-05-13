import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { env } from "../env";
import { inboxItem, project, task } from "../db/schema";
import { HTTPError, requireUser, type Env } from "../middleware/session";

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

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${env.GEMMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: env.GEMMA_MODEL,
        prompt,
        stream: true,
        options: { temperature: 0.4 },
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
});

export const briefingRoutes = router;
