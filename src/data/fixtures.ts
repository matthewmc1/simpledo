export type IntegrationSource =
  | "linear" | "jira" | "gmail" | "email" | "slack" | "calendar" | "manual";

export type Priority = "P1" | "P2" | "P3" | "P4";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  est?: string;
}

export interface Task {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  due: string;
  integration: IntegrationSource | null;
  integrationId?: string;
  notes: string;
  subtasks: Subtask[];
}

export interface InboxItem {
  id: string;
  text: string;
  source: IntegrationSource;
  from?: string;
  age: string;
}

export interface Project {
  id: string;
  name: string;
  count: number;
  color: string;
  source: IntegrationSource | null;
}

export interface Signal {
  kind: "blocking" | "deadline" | "calendar";
  label: string;
  source: string;
}

export interface Recommendation {
  id: string;
  task: string;
  reason: string;
  minutes: number;
  kind: "now" | "morning" | "afternoon";
}

export interface CalendarEvent {
  time: string;
  title: string;
  duration: string;
  attendees: number;
}

export const TODAY = {
  weekday: "Tuesday",
  date: "May 12",
  year: "2026",
  dateLong: "Tuesday, May 12, 2026",
  user: { name: "Mira Adeyemi", role: "Sr. PM, Platform", initials: "MA" },
};

export const AI_BRIEFING: {
  headline: string;
  summary: string;
  signals: Signal[];
  recommend: Recommendation[];
} = {
  headline: "Two unblockers, one quiet morning",
  summary:
    "Diane is waiting on the pricing memo before her 2pm board prep. Two engineers on Onboarding v2 are blocked on a spec decision only you can make. Calendar is clear until 9:30 — protect it.",
  signals: [
    { kind: "blocking", label: "3 people waiting on LIN-2812", source: "Linear" },
    { kind: "deadline", label: "Pricing memo · Diane needs by 1:30", source: "Gmail" },
    { kind: "calendar", label: "Heads-down window: 9:30 → 12:00", source: "Calendar" },
  ],
  recommend: [
    { id: "r1", task: "Spec call: Onboarding v2 hand-off", reason: "Unblocks Sasha & Wren", minutes: 25, kind: "now" },
    { id: "r2", task: "Pricing memo — Diane", reason: "Hard deadline 1:30pm", minutes: 45, kind: "morning" },
    { id: "r3", task: "Approve metric defs (JIRA-DATA-118)", reason: "Blocking analytics handoff", minutes: 10, kind: "morning" },
    { id: "r4", task: "Reply to Marcus on board memo", reason: "2 days cold", minutes: 8, kind: "afternoon" },
  ],
};

export const INBOX: InboxItem[] = [
  { id: "i1", text: "Draft Q3 retention narrative", source: "slack", from: "#growth", age: "2h" },
  { id: "i2", text: "Pick up dry cleaning before Thursday", source: "manual", age: "1d" },
  { id: "i3", text: "Reply to Diane re: pricing deck timing", source: "gmail", from: "Diane Park", age: "4h" },
  { id: "i4", text: "Review onboarding hand-off spec", source: "linear", from: "LIN-2847", age: "30m" },
  { id: "i5", text: "Book annual eye exam", source: "manual", age: "3d" },
];

export const TODAY_TASKS: Task[] = [
  {
    id: "t1",
    title: "Spec write-up: Onboarding v2 hand-off",
    project: "Onboarding v2",
    priority: "P1",
    due: "Today · 12:00",
    integration: "linear",
    integrationId: "LIN-2812",
    notes: "Decide between async hand-off doc vs. live walkthrough. Sasha + Wren blocked.",
    subtasks: [
      { id: "t1a", title: "Skim Sasha's loom (8min)", done: true },
      { id: "t1b", title: "Draft decision tree", done: false },
      { id: "t1c", title: "Post in #onboarding-v2", done: false },
    ],
  },
  {
    id: "t2",
    title: "Approve metric definitions",
    project: "Retention Q3",
    priority: "P1",
    due: "Today",
    integration: "jira",
    integrationId: "DATA-118",
    notes: "Last review before analytics ships dashboards.",
    subtasks: [],
  },
  {
    id: "t3",
    title: "Pricing memo for board prep",
    project: "Board prep",
    priority: "P1",
    due: "Today · 13:30",
    integration: null,
    notes: "Diane is the audience. 1 page. Focus on retention narrative.",
    subtasks: [
      { id: "t3a", title: "Pull churn cohort chart", done: false },
      { id: "t3b", title: "Reconcile with Q1 narrative", done: false },
    ],
  },
  {
    id: "t4",
    title: "Reply to Marcus on board memo",
    project: "Board prep",
    priority: "P2",
    due: "Today",
    integration: "gmail",
    notes: "Marcus's first draft is 80% there. Push back on framing of Section 3.",
    subtasks: [],
  },
  {
    id: "t5",
    title: "1:1 prep — Sasha",
    project: "Team",
    priority: "P3",
    due: "Tomorrow · 10:00",
    integration: "calendar",
    notes: "She wants to talk career growth.",
    subtasks: [],
  },
];

export const PROJECTS: Project[] = [
  { id: "p1", name: "Retention Q3", count: 14, color: "#a85a2c", source: "linear" },
  { id: "p2", name: "Onboarding v2", count: 8, color: "#2d5a3d", source: "linear" },
  { id: "p3", name: "Board prep", count: 5, color: "#5a3da8", source: null },
  { id: "p4", name: "Team", count: 6, color: "#807d72", source: null },
  { id: "p5", name: "Personal", count: 3, color: "#b8843d", source: null },
];

export const CALENDAR: CalendarEvent[] = [
  { time: "9:30", title: "Platform standup", duration: "15m", attendees: 6 },
  { time: "11:00", title: "Onboarding v2 spec review", duration: "45m", attendees: 4 },
  { time: "14:00", title: "Pricing review w/ Diane", duration: "30m", attendees: 2 },
  { time: "16:00", title: "1:1 — Wren", duration: "30m", attendees: 2 },
];
