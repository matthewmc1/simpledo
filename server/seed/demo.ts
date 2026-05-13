import { db } from "../db/client";
import { inboxItem, project, subtask, task } from "../db/schema";

/**
 * Seed Mira's fictional Tuesday into a fresh demo user. Runs once at demo
 * creation; idempotent only insofar as the user is brand-new (we don't check
 * for existing rows).
 */
export async function seedDemoUser(userId: string): Promise<void> {
  // Projects
  const projects = await db
    .insert(project)
    .values([
      { userId, name: "Retention Q3", color: "#a85a2c", source: "linear" },
      { userId, name: "Onboarding v2", color: "#2d5a3d", source: "linear" },
      { userId, name: "Board prep", color: "#5a3da8" },
      { userId, name: "Team", color: "#807d72" },
      { userId, name: "Personal", color: "#b8843d" },
    ])
    .returning({ id: project.id, name: project.name });

  const projId = (name: string) => projects.find((p) => p.name === name)?.id ?? null;

  // Today tasks (mirrors src/data/fixtures.ts TODAY_TASKS, status = today)
  const tasks = await db
    .insert(task)
    .values([
      {
        userId,
        title: "Spec write-up: Onboarding v2 hand-off",
        notes: "Decide between async hand-off doc vs. live walkthrough. Sasha + Wren blocked.",
        priority: "P1",
        status: "today",
        dueText: "Today · 12:00",
        projectId: projId("Onboarding v2"),
        integration: "linear",
        integrationId: "LIN-2812",
      },
      {
        userId,
        title: "Approve metric definitions",
        notes: "Last review before analytics ships dashboards.",
        priority: "P1",
        status: "today",
        dueText: "Today",
        projectId: projId("Retention Q3"),
        integration: "jira",
        integrationId: "DATA-118",
      },
      {
        userId,
        title: "Pricing memo for board prep",
        notes: "Diane is the audience. 1 page. Focus on retention narrative.",
        priority: "P1",
        status: "today",
        dueText: "Today · 13:30",
        projectId: projId("Board prep"),
      },
      {
        userId,
        title: "Reply to Marcus on board memo",
        notes: "Marcus's first draft is 80% there. Push back on framing of Section 3.",
        priority: "P2",
        status: "today",
        dueText: "Today",
        projectId: projId("Board prep"),
        integration: "gmail",
      },
      {
        userId,
        title: "1:1 prep — Sasha",
        notes: "She wants to talk career growth.",
        priority: "P3",
        status: "next",
        dueText: "Tomorrow · 10:00",
        projectId: projId("Team"),
        integration: "calendar",
      },
    ])
    .returning({ id: task.id, title: task.title });

  const t1 = tasks.find((t) => t.title.startsWith("Spec write-up"));
  const t3 = tasks.find((t) => t.title.startsWith("Pricing memo"));
  if (t1) {
    await db.insert(subtask).values([
      { taskId: t1.id, title: "Skim Sasha's loom (8min)", done: true },
      { taskId: t1.id, title: "Draft decision tree", done: false },
      { taskId: t1.id, title: "Post in #onboarding-v2", done: false },
    ]);
  }
  if (t3) {
    await db.insert(subtask).values([
      { taskId: t3.id, title: "Pull churn cohort chart", done: false },
      { taskId: t3.id, title: "Reconcile with Q1 narrative", done: false },
    ]);
  }

  // Inbox items (raw captures from src/data/fixtures.ts INBOX)
  await db.insert(inboxItem).values([
    { userId, text: "Draft Q3 retention narrative", source: "slack", fromLabel: "#growth" },
    { userId, text: "Pick up dry cleaning before Thursday", source: "manual" },
    { userId, text: "Reply to Diane re: pricing deck timing", source: "gmail", fromLabel: "Diane Park" },
    { userId, text: "Review onboarding hand-off spec", source: "linear", fromLabel: "LIN-2847" },
    { userId, text: "Book annual eye exam", source: "manual" },
  ]);
}
