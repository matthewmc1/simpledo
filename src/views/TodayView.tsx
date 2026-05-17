import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { InboxItem, ProcessDestination, Project, Task } from "@shared/types";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { Checkbox } from "../components/Checkbox";
import { PriorityMark } from "../components/PriorityMark";
import { SourceIcon } from "../components/SourceIcon";
import { TODAY } from "../data/fixtures";
import { useSession } from "../auth/SessionProvider";
import {
  useBriefingStore,
  useEnsureBriefingGenerated,
} from "../stores/briefingStore";
import { useInboxStore, useEnsureInboxLoaded } from "../stores/inboxStore";
import { useProjectStore, useEnsureProjectsLoaded } from "../stores/projectStore";
import { useTaskStore, useEnsureTasksLoaded } from "../stores/taskStore";
import { useTweaks } from "../tweaks/TweaksProvider";

export function TodayView() {
  useEnsureTasksLoaded();
  useEnsureProjectsLoaded();
  useEnsureInboxLoaded();
  useEnsureBriefingGenerated();

  const { tweaks } = useTweaks();
  const showBriefing = tweaks.aiProminence !== "quiet";
  const loud = tweaks.aiProminence === "loud";

  const briefingStatus = useBriefingStore((s) => s.status);
  const briefingHeadline = useBriefingStore((s) => s.headline);
  const briefingSummary = useBriefingStore((s) => s.summary);
  const briefingError = useBriefingStore((s) => s.error);
  const regenerateBriefing = useBriefingStore((s) => s.generate);
  const briefingOffline = briefingStatus === "error";
  const briefingStreaming = briefingStatus === "streaming";

  const allTasks = useTaskStore((s) => s.tasks);
  const taskStatus = useTaskStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);
  const inboxItems = useInboxStore((s) => s.items);
  const inboxStatus = useInboxStore((s) => s.status);
  const { state: sessionState } = useSession();
  const firstName =
    sessionState.status === "authenticated"
      ? sessionState.user.name.split(/\s+/)[0]
      : TODAY.user.name.split(" ")[0];

  const todayTasks = useMemo(
    () => allTasks.filter((t) => t.status === "today"),
    [allTasks],
  );
  const waitingCount = useMemo(
    () => allTasks.filter((t) => t.status === "waiting").length,
    [allTasks],
  );
  const dueTodayCount = useMemo(
    () => todayTasks.filter((t) => t.dueText?.toLowerCase().startsWith("today")).length,
    [todayTasks],
  );
  const projectsById = useMemo(
    () => new Map<string, Project>(projects.map((p) => [p.id, p])),
    [projects],
  );

  const briefingReady = taskStatus === "ready" && inboxStatus === "ready";

  const fallbackHeadline = !briefingReady
    ? "Drafting your briefing…"
    : todayTasks.length === 0 && inboxItems.length === 0
      ? "A quiet start"
      : todayTasks.length === 0
        ? `${inboxItems.length} thing${inboxItems.length === 1 ? "" : "s"} to process`
        : `${todayTasks.length} on your plate today`;

  const fallbackSummary = !briefingReady
    ? ""
    : todayTasks.length === 0 && inboxItems.length === 0
      ? "Nothing in Today and inbox is zero. Capture a thought with ⌘K or plan a project to get rolling."
      : todayTasks.length === 0
        ? "Open the inbox and decide where each item goes — do, defer, delegate, or drop."
        : "Your Today list is below. Work top to bottom; capture anything new with ⌘K.";

  const liveHeadline = briefingHeadline || fallbackHeadline;
  const liveSummary =
    briefingSummary || (briefingOffline || !briefingStreaming ? fallbackSummary : "");

  // Computed chips, only the ones with non-zero data.
  const chips: { label: string; tone?: "accent" | "muted" }[] = [];
  if (todayTasks.length > 0)
    chips.push({
      label: `${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} for today`,
      tone: "accent",
    });
  if (dueTodayCount > 0)
    chips.push({
      label: `${dueTodayCount} with a due time today`,
    });
  if (waitingCount > 0)
    chips.push({ label: `Waiting on ${waitingCount}` });
  if (inboxItems.length > 0)
    chips.push({
      label: `${inboxItems.length} in inbox`,
    });

  return (
    <BriefingShell>
      <div style={{ padding: "28px 40px 40px" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 24,
            borderBottom: "1px solid var(--hairline)",
            paddingBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 4,
              }}
            >
              {formatToday()}
            </div>
            <h1
              style={{
                fontFamily: "var(--serif)",
                fontWeight: 400,
                fontSize: 42,
                lineHeight: 1,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {greeting()}, {firstName}.
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {loud && (
              <button
                onClick={() => void regenerateBriefing()}
                disabled={briefingStreaming}
                style={{
                  fontFamily: "var(--ui)",
                  fontSize: 13,
                  padding: "8px 14px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 3,
                  cursor: briefingStreaming ? "default" : "pointer",
                  color: "var(--paper)",
                  opacity: briefingStreaming ? 0.6 : 1,
                }}
              >
                {briefingStreaming ? "✦ Drafting…" : "✦ Ask Gemma"}
              </button>
            )}
            <Link
              to="/review"
              style={{
                fontFamily: "var(--ui)",
                fontSize: 13,
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--hairline)",
                borderRadius: 3,
                cursor: "pointer",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              Weekly review
            </Link>
          </div>
        </header>

        {showBriefing && (
          <section
            style={{
              background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
              border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
              borderRadius: 4,
              padding: "22px 26px",
              marginBottom: 28,
              display: "grid",
              gridTemplateColumns: todayTasks.length > 0 ? "1fr 280px" : "1fr",
              gap: 32,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: briefingOffline ? "var(--muted)" : "var(--accent)",
                    animation: briefingStreaming ? "pulse 1.4s infinite" : "none",
                  }}
                />
                {briefingOffline
                  ? "Gemma offline · showing example"
                  : briefingStreaming
                    ? "Today's briefing · drafting…"
                    : "Today's briefing · just now"}
              </div>
              <h2
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: 28,
                  lineHeight: 1.15,
                  margin: "0 0 10px",
                  letterSpacing: "-0.01em",
                  minHeight: 32,
                }}
              >
                "{liveHeadline}
                {briefingStreaming && !briefingHeadline ? "" : "."}"
              </h2>
              <p
                style={{
                  fontFamily: "var(--ui)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  margin: 0,
                  color: "var(--ink)",
                  minHeight: 44,
                }}
              >
                {liveSummary ||
                  (briefingStreaming ? "" : briefingError ? briefingError : "")}
              </p>
              {chips.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {chips.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        background: "var(--paper)",
                        border: "1px solid var(--hairline)",
                        borderRadius: 999,
                        fontSize: 12,
                        color: s.tone === "accent" ? "var(--accent)" : "var(--ink)",
                      }}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {todayTasks.length > 0 && (
              <div
                style={{
                  borderLeft: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
                  paddingLeft: 24,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    marginBottom: 10,
                  }}
                >
                  Order of play
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {orderOfPlay(todayTasks).slice(0, 4).map((t, i) => (
                    <li
                      key={t.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "20px 1fr auto",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Link
                        to={`/task/${t.id}`}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.3,
                          color: "var(--ink)",
                          textDecoration: "none",
                        }}
                      >
                        {t.title}
                      </Link>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                        {t.priority}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 24 }}>
          <div>
            <LaneHeader title="Today" count={`${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"}`} />
            {taskStatus === "loading" && todayTasks.length === 0 ? (
              <PlaceholderRow label="Loading…" />
            ) : todayTasks.length === 0 ? (
              <PlaceholderRow label="Nothing on your list yet. Press ⌘K to capture something." />
            ) : (
              <TaskList tasks={todayTasks} projectsById={projectsById} />
            )}
          </div>
          <div>
            <LaneHeader
              title={
                <>
                  Inbox{" "}
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 400 }}>
                    · {inboxItems.length}
                  </span>
                </>
              }
              right={
                <Link
                  to="/inbox"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                    textDecoration: "none",
                  }}
                >
                  Process →
                </Link>
              }
            />
            {inboxStatus === "loading" && inboxItems.length === 0 ? (
              <PlaceholderRow label="Loading…" />
            ) : inboxItems.length === 0 ? (
              <PlaceholderRow label="Inbox zero." />
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {inboxItems.map((item, i) => (
                  <InboxRow key={item.id} item={item} divider={i < inboxItems.length - 1} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </BriefingShell>
  );
}

function LaneHeader({
  title,
  count,
  right,
}: {
  title: React.ReactNode;
  count?: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
      <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 22, margin: 0 }}>{title}</h3>
      {right ?? <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{count}</span>}
    </div>
  );
}

function PlaceholderRow({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "16px 0",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--muted)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {label}
    </div>
  );
}

function TaskList({
  tasks,
  projectsById,
}: {
  tasks: Task[];
  projectsById: Map<string, Project>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {tasks.map((t, i) => (
        <TaskRow
          key={t.id}
          task={t}
          projectName={t.projectId ? projectsById.get(t.projectId)?.name ?? "" : ""}
          divider={i < tasks.length - 1}
          editing={editingId === t.id}
          onStartEdit={() => setEditingId(t.id)}
          onEndEdit={() => setEditingId(null)}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  task: Task;
  projectName: string;
  divider: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
}

function TaskRow({ task, projectName, divider, editing, onStartEdit, onEndEdit }: RowProps) {
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const setTitle = useTaskStore((s) => s.setTitle);
  const cyclePriority = useTaskStore((s) => s.cyclePriority);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);

  const showSubtasks = task.subtasks.length > 0;
  const dueShort = task.dueText?.replace("Today · ", "") ?? "";

  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(task.title);

  useEffect(() => {
    if (editing) {
      setDraft(task.title);
      // Focus on next tick so the input exists.
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [editing, task.title]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== task.title) {
      void setTitle(task.id, draft);
    }
    onEndEdit();
  };

  const cancel = () => {
    setDraft(task.title);
    onEndEdit();
  };

  return (
    <li data-row style={{ borderBottom: divider ? "1px solid var(--hairline)" : "none" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <Checkbox onClick={() => void toggleDone(task.id)} />
        <div>
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              style={{
                width: "100%",
                fontSize: 15,
                lineHeight: 1.3,
                marginBottom: 4,
                fontFamily: "var(--ui)",
                color: "var(--ink)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--accent)",
                outline: "none",
                padding: "0 0 2px 0",
              }}
            />
          ) : (
            <div
              onClick={onStartEdit}
              style={{
                fontSize: 15,
                lineHeight: 1.3,
                marginBottom: 4,
                cursor: "text",
              }}
            >
              {task.title}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            <button
              type="button"
              onClick={() => void cyclePriority(task.id)}
              title="Click to change priority"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
                color: "inherit",
              }}
            >
              <PriorityMark p={task.priority} size={8} />
              {task.priority}
            </button>
            {projectName && (
              <>
                <span>·</span>
                <span>{projectName}</span>
              </>
            )}
            {task.integration && (
              <>
                <span>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <SourceIcon source={task.integration} size={10} />
                  {task.integrationId || task.integration}
                </span>
              </>
            )}
          </div>
          {showSubtasks && (
            <ul
              style={{
                margin: "10px 0 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                borderLeft: "1px solid var(--hairline)",
                paddingLeft: 12,
              }}
            >
              {task.subtasks.map((st) => (
                <li
                  key={st.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: st.done ? "var(--muted)" : "var(--ink)",
                    textDecoration: st.done ? "line-through" : "none",
                  }}
                >
                  <Checkbox
                    checked={st.done}
                    size={11}
                    onClick={() => void toggleSubtask(task.id, st.id)}
                  />
                  {st.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap" }}>
          {dueShort}
        </span>
      </div>
    </li>
  );
}

function InboxRow({ item, divider }: { item: InboxItem; divider: boolean }) {
  const processItem = useInboxStore((s) => s.processItem);
  const actions: { glyph: string; title: string; aria: string; dest: ProcessDestination }[] = [
    { glyph: "→", title: "Send to Next", aria: "Send to Next", dest: "next" },
    { glyph: "✓", title: "Send to Today", aria: "Send to Today", dest: "today" },
    { glyph: "×", title: "Delete", aria: "Delete", dest: "delete" },
  ];
  return (
    <li
      data-row
      style={{
        display: "grid",
        gridTemplateColumns: "18px 1fr auto",
        gap: 12,
        alignItems: "center",
        borderBottom: divider ? "1px solid var(--hairline)" : "none",
      }}
    >
      <span style={{ color: "var(--muted)" }}>
        <SourceIcon source={item.source} size={13} />
      </span>
      <div>
        <div style={{ fontSize: 14, lineHeight: 1.3 }}>{item.text}</div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: 2,
          }}
        >
          {item.fromLabel || item.source} · {relativeTime(item.capturedAt)} ago
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {actions.map((a) => (
          <button
            key={a.glyph}
            title={a.title}
            aria-label={a.aria}
            onClick={() => void processItem(item.id, a.dest)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 3,
              border: "1px solid var(--hairline)",
              background: "var(--paper)",
              color: "var(--muted)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {a.glyph}
          </button>
        ))}
      </div>
    </li>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatToday(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const month = d.toLocaleDateString(undefined, { month: "long" });
  return `${weekday} · ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

function orderOfPlay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dueA = a.due ? new Date(a.due).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.due ? new Date(b.due).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
