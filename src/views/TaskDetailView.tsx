import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Priority, Release, Status, Subtask, Task } from "@shared/types";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { SectionLabel } from "../components/briefing/SectionLabel";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { Checkbox } from "../components/Checkbox";
import { DatePicker } from "../components/DatePicker";
import { PriorityMark } from "../components/PriorityMark";
import { useEnsureProjectsLoaded, useProjectStore } from "../stores/projectStore";
import {
  EMPTY_RELEASES,
  useEnsureReleasesLoaded,
  useReleaseStore,
} from "../stores/releaseStore";
import { useEnsureTasksLoaded, useTaskStore } from "../stores/taskStore";

const STATUSES: Status[] = ["inbox", "today", "next", "waiting", "someday", "done"];
const STATUS_LABELS: Record<Status, string> = {
  inbox: "Inbox",
  today: "Today",
  next: "Next",
  waiting: "Waiting",
  someday: "Someday",
  done: "Done",
};
const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

function formatHumanDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskDetailView() {
  useEnsureTasksLoaded();
  useEnsureProjectsLoaded();

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const tasks = useTaskStore((s) => s.tasks);
  const taskStatus = useTaskStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);

  const setTitle = useTaskStore((s) => s.setTitle);
  const setNotes = useTaskStore((s) => s.setNotes);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setDue = useTaskStore((s) => s.setDue);
  const setProject = useTaskStore((s) => s.setProject);
  const setRelease = useTaskStore((s) => s.setRelease);
  const setClientDescription = useTaskStore((s) => s.setClientDescription);
  const setPriority = useTaskStore((s) => s.setPriority);
  const cyclePriority = useTaskStore((s) => s.cyclePriority);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const addSubtask = useTaskStore((s) => s.addSubtask);
  const editSubtask = useTaskStore((s) => s.editSubtask);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);
  const deleteSubtask = useTaskStore((s) => s.deleteSubtask);

  const task = useMemo(() => tasks.find((t) => t.id === id) ?? null, [tasks, id]);
  const project = useMemo(
    () => (task?.projectId ? projects.find((p) => p.id === task.projectId) ?? null : null),
    [projects, task?.projectId],
  );

  // Releases for the task's project, so the picker has the right list.
  useEnsureReleasesLoaded(project?.id);
  // Selector returns the live array reference or undefined; fall back to a
  // stable empty array outside the selector to avoid re-render churn.
  const projectReleasesRaw = useReleaseStore((s) =>
    project ? s.byProject.get(project.id) : undefined,
  );
  const projectReleases = projectReleasesRaw ?? EMPTY_RELEASES;
  const release = useMemo(
    () =>
      task?.releaseId
        ? projectReleases.find((r) => r.id === task.releaseId) ?? null
        : null,
    [projectReleases, task?.releaseId],
  );

  if (!task && taskStatus === "ready") {
    return (
      <BriefingShell>
        <NotFound onBack={() => navigate("/")} />
      </BriefingShell>
    );
  }

  if (!task) {
    return (
      <BriefingShell>
        <div
          style={{
            padding: 40,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Loading task…
        </div>
      </BriefingShell>
    );
  }

  return (
    <TaskDetail
      task={task}
      projectName={project?.name ?? ""}
      projectColor={project?.color ?? ""}
      releases={projectReleases}
      releaseLabel={release ? `${release.version}${release.name ? ` · ${release.name}` : ""}` : ""}
      onBack={() => navigate(-1)}
      onSetTitle={(t) => void setTitle(task.id, t)}
      onSetNotes={(n) => void setNotes(task.id, n)}
      onSetStatus={(s) => void setStatus(task.id, s)}
      onSetDue={(due, dueText) => void setDue(task.id, due, dueText)}
      onSetProject={(pid) => void setProject(task.id, pid)}
      onSetRelease={(rid) => void setRelease(task.id, rid)}
      onSetClientDescription={(text) => void setClientDescription(task.id, text)}
      onSetPriority={(p) => void setPriority(task.id, p)}
      onCyclePriority={() => void cyclePriority(task.id)}
      onToggleDone={() => void toggleDone(task.id)}
      onDelete={async () => {
        if (!confirm(`Delete "${task.title}"?`)) return;
        await deleteTask(task.id);
        navigate("/");
      }}
      onAddSubtask={(title) => void addSubtask(task.id, title)}
      onEditSubtask={(stId, title) => void editSubtask(task.id, stId, title)}
      onToggleSubtask={(stId) => void toggleSubtask(task.id, stId)}
      onDeleteSubtask={(stId) => void deleteSubtask(task.id, stId)}
    />
  );
}

interface DetailProps {
  task: Task;
  projectName: string;
  projectColor: string;
  releases: Release[];
  releaseLabel: string;
  onBack: () => void;
  onSetTitle: (title: string) => void;
  onSetNotes: (notes: string) => void;
  onSetStatus: (status: Status) => void;
  onSetDue: (due: string | null, dueText: string | null) => void;
  onSetProject: (projectId: string | null) => void;
  onSetRelease: (releaseId: string | null) => void;
  onSetClientDescription: (text: string) => void;
  onSetPriority: (priority: Priority) => void;
  onCyclePriority: () => void;
  onToggleDone: () => void;
  onDelete: () => Promise<void>;
  onAddSubtask: (title: string) => void;
  onEditSubtask: (subtaskId: string, title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
}

function TaskDetail({
  task,
  projectName,
  projectColor,
  releases,
  releaseLabel,
  onBack,
  onSetTitle,
  onSetNotes,
  onSetStatus,
  onSetDue,
  onSetProject,
  onSetRelease,
  onSetClientDescription,
  onSetPriority,
  onCyclePriority,
  onToggleDone,
  onDelete,
  onAddSubtask,
  onEditSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: DetailProps) {
  // Title inline edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingTitle) {
      setDraftTitle(task.title);
      window.requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      });
    }
  }, [editingTitle, task.title]);

  // Notes inline edit
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(task.notes);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingNotes) {
      setDraftNotes(task.notes);
      window.requestAnimationFrame(() => notesRef.current?.focus());
    }
  }, [editingNotes, task.notes]);

  // Project picker visibility
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Release picker visibility
  const [releasePickerOpen, setReleasePickerOpen] = useState(false);

  // Client description inline edit
  const [editingClientDesc, setEditingClientDesc] = useState(false);
  const [draftClientDesc, setDraftClientDesc] = useState(task.clientDescription);
  const clientDescRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingClientDesc) {
      setDraftClientDesc(task.clientDescription);
      window.requestAnimationFrame(() => clientDescRef.current?.focus());
    }
  }, [editingClientDesc, task.clientDescription]);

  const commitClientDesc = () => {
    setEditingClientDesc(false);
    if (draftClientDesc !== task.clientDescription) {
      onSetClientDescription(draftClientDesc);
    }
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== task.title) onSetTitle(trimmed);
  };

  const commitNotes = () => {
    setEditingNotes(false);
    if (draftNotes !== task.notes) onSetNotes(draftNotes);
  };

  const subtasksDone = task.subtasks.filter((s) => s.done).length;

  return (
    <BriefingShell activeOverride={projectName}>
      <ViewHeader
        eyebrow={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>
              Today
            </Link>
            <span>›</span>
            {projectName ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {projectColor && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: projectColor,
                    }}
                  />
                )}
                {projectName}
              </span>
            ) : (
              <span style={{ color: "var(--muted)" }}>No project</span>
            )}
            <span>›</span>
            <span style={{ color: "var(--ink)" }}>{STATUS_LABELS[task.status]}</span>
          </span>
        }
        title={
          editingTitle ? (
            <input
              ref={titleRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingTitle(false);
                }
              }}
              style={{
                width: "100%",
                fontFamily: "var(--serif)",
                fontWeight: 400,
                fontSize: 42,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--accent)",
                outline: "none",
                padding: 0,
              }}
            />
          ) : (
            <span
              onClick={() => setEditingTitle(true)}
              style={{ cursor: "text" }}
              title="Click to edit"
            >
              {task.title}
            </span>
          )
        }
        actions={
          <>
            <button onClick={onBack} style={btnGhost}>
              ← Back
            </button>
            <button onClick={onDelete} style={{ ...btnGhost, color: "var(--muted)" }}>
              Delete
            </button>
            <button onClick={onToggleDone} style={btnPrimary}>
              {task.status === "done" ? "Reopen" : "Mark done"}
            </button>
          </>
        }
      />

      <div
        style={{
          padding: "24px 40px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 36,
        }}
      >
        <div>
          {/* Priority + status pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <button
              type="button"
              onClick={onCyclePriority}
              title="Click to cycle priority"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                border: "1px solid var(--hairline)",
                background: "transparent",
                borderRadius: 3,
                cursor: "pointer",
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                color: "var(--ink)",
              }}
            >
              <PriorityMark p={task.priority} size={8} />
              {task.priority}
            </button>
            {task.dueText && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.06em",
                }}
              >
                Due {task.dueText}
              </span>
            )}
          </div>

          {/* Notes */}
          <section
            style={{
              marginBottom: 32,
              paddingBottom: 28,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <SectionLabel label="Notes" small />
            {editingNotes ? (
              <textarea
                ref={notesRef}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={commitNotes}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingNotes(false);
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitNotes();
                  }
                }}
                placeholder="Add context, decisions, links…"
                rows={6}
                style={{
                  width: "100%",
                  marginTop: 10,
                  fontFamily: "var(--serif)",
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                  background: "transparent",
                  border: "1px solid var(--hairline)",
                  borderRadius: 4,
                  outline: "none",
                  padding: 12,
                  resize: "vertical",
                }}
              />
            ) : (
              <div
                onClick={() => setEditingNotes(true)}
                style={{
                  marginTop: 10,
                  fontFamily: "var(--serif)",
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: task.notes ? "var(--ink)" : "var(--muted)",
                  fontStyle: task.notes ? "normal" : "italic",
                  cursor: "text",
                  whiteSpace: "pre-wrap",
                  minHeight: 28,
                }}
              >
                {task.notes || "Click to add notes — context, decisions, links."}
              </div>
            )}
          </section>

          {/* Client description — used in release changelogs. */}
          <section
            style={{
              marginBottom: 32,
              paddingBottom: 28,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <SectionLabel label="Client-facing description" small />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                Used in changelog · falls back to title
              </span>
            </div>
            {editingClientDesc ? (
              <textarea
                ref={clientDescRef}
                value={draftClientDesc}
                onChange={(e) => setDraftClientDesc(e.target.value)}
                onBlur={commitClientDesc}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingClientDesc(false);
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitClientDesc();
                  }
                }}
                placeholder="One-line copy for the release notes — write it like you'd want a customer to read it."
                rows={2}
                style={{
                  width: "100%",
                  fontFamily: "var(--serif)",
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: "var(--ink)",
                  background: "transparent",
                  border: "1px solid var(--hairline)",
                  borderRadius: 4,
                  outline: "none",
                  padding: 10,
                  resize: "vertical",
                }}
              />
            ) : (
              <div
                onClick={() => setEditingClientDesc(true)}
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: task.clientDescription ? "var(--ink)" : "var(--muted)",
                  fontStyle: task.clientDescription ? "normal" : "italic",
                  cursor: "text",
                  whiteSpace: "pre-wrap",
                  minHeight: 24,
                }}
              >
                {task.clientDescription ||
                  "Click to add a customer-facing one-liner. If left blank, the changelog will use the task title."}
              </div>
            )}
          </section>

          {/* Subtasks */}
          <section style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                Subtasks ·{" "}
                {task.subtasks.length === 0
                  ? "none"
                  : `${subtasksDone} of ${task.subtasks.length} done`}
              </div>
            </div>
            {task.subtasks.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--muted)",
                  fontSize: 14,
                  margin: "8px 0 12px",
                }}
              >
                Break this down into the next concrete actions.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {task.subtasks.map((st, i) => (
                  <SubtaskRow
                    key={st.id}
                    subtask={st}
                    divider={i < task.subtasks.length - 1}
                    onToggle={() => onToggleSubtask(st.id)}
                    onEdit={(title) => onEditSubtask(st.id, title)}
                    onDelete={() => onDeleteSubtask(st.id)}
                  />
                ))}
              </ul>
            )}
            <SubtaskAdd onAdd={onAddSubtask} />
          </section>
        </div>

        {/* ── Right column · Properties ───────────────────────────── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Status */}
          <div>
            <SectionLabel label="Status" small />
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                padding: 3,
              }}
            >
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetStatus(s)}
                  aria-pressed={task.status === s}
                  style={{
                    flex: "1 0 auto",
                    padding: "5px 8px",
                    background: task.status === s ? "var(--ink)" : "transparent",
                    color: task.status === s ? "var(--paper)" : "var(--ink)",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <SectionLabel label="Priority" small />
            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 4,
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                padding: 3,
              }}
            >
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSetPriority(p)}
                  aria-pressed={task.priority === p}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    background: task.priority === p ? "var(--ink)" : "transparent",
                    color: task.priority === p ? "var(--paper)" : "var(--ink)",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: "0.05em",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  <PriorityMark p={p} size={6} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Due */}
          <div>
            <SectionLabel label="Due" small />
            <div style={{ marginTop: 10 }}>
              <DatePicker
                value={task.due}
                onChange={(iso) => onSetDue(iso, iso ? formatHumanDate(iso) : null)}
              />
            </div>
          </div>

          {/* Project */}
          <div>
            <SectionLabel label="Project" small />
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setProjectPickerOpen((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--hairline)",
                  borderRadius: 3,
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                {projectName ? (
                  <>
                    {projectColor && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: projectColor,
                        }}
                      />
                    )}
                    {projectName}
                  </>
                ) : (
                  <span style={{ color: "var(--muted)", fontStyle: "italic" }}>No project</span>
                )}
                <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>
                  {projectPickerOpen ? "▴" : "▾"}
                </span>
              </button>
              {projectPickerOpen && (
                <ProjectPicker
                  currentId={task.projectId}
                  onPick={(pid) => {
                    onSetProject(pid);
                    setProjectPickerOpen(false);
                    // Releases are scoped to a project — if the project changes,
                    // clear the release association.
                    if (pid !== task.projectId) onSetRelease(null);
                  }}
                />
              )}
            </div>
          </div>

          {/* Release */}
          {task.projectId && (
            <div>
              <SectionLabel label="Release" small />
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setReleasePickerOpen((v) => !v)}
                  disabled={releases.length === 0}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    border: "1px solid var(--hairline)",
                    borderRadius: 3,
                    background: "transparent",
                    color: "var(--ink)",
                    cursor: releases.length === 0 ? "default" : "pointer",
                    fontFamily: "var(--ui)",
                    fontSize: 13,
                    textAlign: "left",
                    opacity: releases.length === 0 ? 0.6 : 1,
                  }}
                >
                  {releaseLabel ? (
                    <span style={{ fontFamily: "var(--mono)" }}>{releaseLabel}</span>
                  ) : (
                    <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                      {releases.length === 0 ? "No releases on this project yet" : "Unassigned"}
                    </span>
                  )}
                  {releases.length > 0 && (
                    <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>
                      {releasePickerOpen ? "▴" : "▾"}
                    </span>
                  )}
                </button>
                {releasePickerOpen && releases.length > 0 && (
                  <ReleasePicker
                    currentId={task.releaseId}
                    releases={releases}
                    onPick={(rid) => {
                      onSetRelease(rid);
                      setReleasePickerOpen(false);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div>
            <SectionLabel label="Timestamps" small />
            <ul
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--muted)",
              }}
            >
              <li>Created · {formatTimestamp(task.createdAt)}</li>
              <li>Updated · {formatTimestamp(task.updatedAt)}</li>
            </ul>
          </div>
        </aside>
      </div>
    </BriefingShell>
  );
}

function ProjectPicker({
  currentId,
  onPick,
}: {
  currentId: string | null;
  onPick: (projectId: string | null) => void;
}) {
  const projects = useProjectStore((s) => s.projects);
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter]);

  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--hairline)",
        borderRadius: 3,
        background: "var(--paper)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search projects…"
        style={{
          width: "100%",
          fontFamily: "var(--ui)",
          fontSize: 13,
          padding: "8px 10px",
          border: "none",
          borderBottom: "1px solid var(--hairline)",
          outline: "none",
          background: "transparent",
          boxSizing: "border-box",
        }}
      />
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "none",
              background: currentId === null ? "color-mix(in oklch, var(--accent) 8%, transparent)" : "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontStyle: "italic",
              color: "var(--muted)",
              fontFamily: "var(--ui)",
              fontSize: 13,
            }}
          >
            No project
          </button>
        </li>
        {filtered.length === 0 && filter.trim() !== "" && (
          <li
            style={{
              padding: "8px 10px",
              fontStyle: "italic",
              color: "var(--muted)",
              fontFamily: "var(--ui)",
              fontSize: 12,
            }}
          >
            No match.
          </li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "none",
                background:
                  currentId === p.id
                    ? "color-mix(in oklch, var(--accent) 8%, transparent)"
                    : "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--ui)",
                fontSize: 13,
                color: "var(--ink)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: p.color,
                }}
              />
              {p.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SubtaskRowProps {
  subtask: Subtask;
  divider: boolean;
  onToggle: () => void;
  onEdit: (title: string) => void;
  onDelete: () => void;
}

function SubtaskRow({ subtask, divider, onToggle, onEdit, onDelete }: SubtaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subtask.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(subtask.title);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, subtask.title]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== subtask.title) onEdit(trimmed);
  };

  return (
    <li
      data-row
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        padding: "10px 0",
        borderBottom: divider ? "1px dotted var(--hairline)" : "none",
        alignItems: "center",
      }}
    >
      <Checkbox checked={subtask.done} size={16} onClick={onToggle} />
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
              setEditing(false);
            }
          }}
          style={{
            fontSize: 15,
            color: "var(--ink)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--accent)",
            outline: "none",
            padding: "1px 0 2px",
            fontFamily: "var(--ui)",
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{
            fontSize: 15,
            color: subtask.done ? "var(--muted)" : "var(--ink)",
            textDecoration: subtask.done ? "line-through" : "none",
            cursor: "text",
          }}
        >
          {subtask.title}
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete subtask"
        title="Delete subtask"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          fontSize: 14,
          padding: 0,
          width: 20,
          height: 20,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </li>
  );
}

function SubtaskAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  };
  return (
    <div
      style={{
        marginTop: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "1px dashed var(--hairline)",
        borderRadius: 4,
      }}
    >
      <span style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>+</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a subtask — ⏎ to add"
        style={{
          flex: 1,
          fontFamily: "var(--ui)",
          fontSize: 14,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--ink)",
        }}
      />
      {value.trim() && (
        <button
          type="button"
          onClick={submit}
          style={{
            ...btnPrimary,
            padding: "4px 10px",
            fontSize: 11,
          }}
        >
          Add
        </button>
      )}
    </div>
  );
}

function ReleasePicker({
  currentId,
  releases,
  onPick,
}: {
  currentId: string | null;
  releases: Release[];
  onPick: (releaseId: string | null) => void;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--hairline)",
        borderRadius: 3,
        background: "var(--paper)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 220, overflowY: "auto" }}>
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "none",
              background:
                currentId === null
                  ? "color-mix(in oklch, var(--accent) 8%, transparent)"
                  : "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontStyle: "italic",
              color: "var(--muted)",
              fontFamily: "var(--ui)",
              fontSize: 13,
            }}
          >
            Unassigned
          </button>
        </li>
        {releases.map((r) => {
          const released = !!r.releasedAt;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  background:
                    currentId === r.id
                      ? "color-mix(in oklch, var(--accent) 8%, transparent)"
                      : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "var(--ui)",
                  fontSize: 13,
                  color: "var(--ink)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: released ? "#2d7a4c" : "var(--muted)",
                  }}
                />
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.version}</span>
                {r.name && (
                  <span style={{ fontStyle: "italic", color: "var(--muted)", fontSize: 12 }}>
                    · {r.name}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ padding: 40, fontFamily: "var(--ui)" }}>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        404
      </div>
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontWeight: 400,
          fontSize: 36,
          margin: "0 0 10px",
          letterSpacing: "-0.02em",
        }}
      >
        Task not found.
      </h1>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--muted)",
          margin: "0 0 18px",
        }}
      >
        It may have been deleted, or the link is wrong.
      </p>
      <button onClick={onBack} style={btnPrimary}>
        Back to Today
      </button>
    </div>
  );
}
