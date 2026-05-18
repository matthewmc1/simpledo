import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Project, Task } from "@shared/types";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { SectionLabel } from "../components/briefing/SectionLabel";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { Checkbox } from "../components/Checkbox";
import { PriorityMark } from "../components/PriorityMark";
import { ReleaseTimeline } from "../components/ReleaseTimeline";
import { SourceIcon } from "../components/SourceIcon";
import { useProjectCreateModal } from "../stores/projectModalStore";
import {
  useEnsureProjectsLoaded,
  useProjectStore,
} from "../stores/projectStore";
import {
  useEnsureProjectTasksLoaded,
  useTaskStore,
} from "../stores/taskStore";

const COLOR_SWATCHES = ["#a85a2c", "#2d5a3d", "#5a3da8", "#3d4a8a", "#b8843d", "#807d72"];

const ACTIVE_STATUSES = new Set(["today", "next", "inbox"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ProjectView() {
  useEnsureProjectsLoaded();
  const { id } = useParams<{ id: string }>();
  useEnsureProjectTasksLoaded(id);
  const navigate = useNavigate();
  const openCreate = useProjectCreateModal((s) => s.setOpen);

  const projects = useProjectStore((s) => s.projects);
  const projectStatus = useProjectStore((s) => s.status);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const tasks = useTaskStore((s) => s.tasks);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const createTask = useTaskStore((s) => s.createTask);

  const project = useMemo(() => projects.find((p) => p.id === id) ?? null, [projects, id]);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === id),
    [tasks, id],
  );

  const groups = useMemo(() => {
    const active: Task[] = [];
    const waiting: Task[] = [];
    const done: Task[] = [];
    const weekAgo = Date.now() - WEEK_MS;
    for (const t of projectTasks) {
      if (t.status === "waiting") waiting.push(t);
      else if (t.status === "done") {
        if (new Date(t.updatedAt).getTime() >= weekAgo) done.push(t);
      } else if (ACTIVE_STATUSES.has(t.status)) active.push(t);
    }
    return { active, waiting, done };
  }, [projectTasks]);

  // Title inline edit
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingName && project) {
      setDraftName(project.name);
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [editingName, project]);

  // Description inline edit
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingDesc && project) {
      setDraftDesc(project.description);
      window.requestAnimationFrame(() => descRef.current?.focus());
    }
  }, [editingDesc, project]);

  // Quick add for tasks within this project
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [adding, setAdding] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (quickAddOpen) {
      window.requestAnimationFrame(() => quickAddRef.current?.focus());
    }
  }, [quickAddOpen]);

  const submitQuickAdd = async () => {
    const trimmed = quickAddText.trim();
    if (!trimmed || !project) return;
    setAdding(true);
    const created = await createTask({
      title: trimmed,
      status: "today",
      projectId: project.id,
    });
    setAdding(false);
    if (created) {
      setQuickAddText("");
      // Keep the input open for rapid entry — close with Esc.
      window.requestAnimationFrame(() => quickAddRef.current?.focus());
    }
  };

  if (projectStatus === "ready" && !project) {
    return (
      <BriefingShell>
        <NotFound onBack={() => navigate("/")} />
      </BriefingShell>
    );
  }

  if (!project) {
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
          Loading project…
        </div>
      </BriefingShell>
    );
  }

  const totalCount = projectTasks.length;
  const doneCount = projectTasks.filter((t) => t.status === "done").length;
  const progress = totalCount === 0 ? 0 : doneCount / totalCount;

  const commitName = () => {
    const trimmed = draftName.trim();
    setEditingName(false);
    if (trimmed && trimmed !== project.name) {
      void updateProject(project.id, { name: trimmed });
    }
  };

  const commitDesc = () => {
    setEditingDesc(false);
    if (draftDesc !== project.description) {
      void updateProject(project.id, { description: draftDesc });
    }
  };

  const onColorCycle = () => {
    const i = COLOR_SWATCHES.indexOf(project.color);
    const next = COLOR_SWATCHES[(i + 1) % COLOR_SWATCHES.length];
    void updateProject(project.id, { color: next });
  };

  const onArchiveProject = async () => {
    const next = !project.archived;
    if (next && !confirm(`Archive "${project.name}"? It'll be hidden from the sidebar but tasks stay put. You can unarchive any time.`)) {
      return;
    }
    await updateProject(project.id, { archived: next });
    if (next) navigate("/");
  };

  const onDeleteProject = async () => {
    const totalCount = projectTasks.length;
    const msg = totalCount > 0
      ? `Delete "${project.name}" and all ${totalCount} task${totalCount === 1 ? "" : "s"} inside it? This can't be undone.`
      : `Delete "${project.name}"? This can't be undone.`;
    if (!confirm(msg)) return;
    await deleteProject(project.id);
    navigate("/");
  };

  return (
    <BriefingShell activeOverride={project.name}>
      <ViewHeader
        eyebrow={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={onColorCycle}
              aria-label="Cycle project color"
              title="Click to cycle color"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: project.color,
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            />
            Project · {totalCount} task{totalCount === 1 ? "" : "s"}
          </span>
        }
        title={
          editingName ? (
            <input
              ref={nameRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitName();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingName(false);
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
            <span onClick={() => setEditingName(true)} style={{ cursor: "text" }}>
              {project.name}
            </span>
          )
        }
        actions={
          <>
            <button onClick={() => openCreate(true)} style={btnGhost}>
              + Project
            </button>
            <button onClick={onArchiveProject} style={{ ...btnGhost, color: "var(--muted)" }}>
              {project.archived ? "Unarchive" : "Archive"}
            </button>
            <button onClick={onDeleteProject} style={{ ...btnGhost, color: "var(--accent)", borderColor: "var(--accent)" }}>
              Delete
            </button>
            <button style={btnPrimary} onClick={() => setQuickAddOpen((v) => !v)}>
              + Task
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 40px 40px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 36 }}>
        <div>
          <section style={{ marginBottom: 28 }}>
            {editingDesc ? (
              <textarea
                ref={descRef}
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                onBlur={commitDesc}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingDesc(false);
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitDesc();
                  }
                }}
                placeholder="What is this project about? What does done look like?"
                rows={3}
                style={{
                  width: "100%",
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 18,
                  lineHeight: 1.45,
                  color: "var(--ink)",
                  background: "transparent",
                  border: "1px solid var(--hairline)",
                  borderRadius: 4,
                  outline: "none",
                  padding: 10,
                  resize: "vertical",
                  marginBottom: 16,
                }}
              />
            ) : (
              <p
                onClick={() => setEditingDesc(true)}
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 18,
                  lineHeight: 1.45,
                  margin: "0 0 16px",
                  color: project.description ? "var(--ink)" : "var(--muted)",
                  fontStyle: "italic",
                  cursor: "text",
                }}
              >
                {project.description || "Click to add a description."}
              </p>
            )}

            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    marginBottom: 6,
                  }}
                >
                  <span>
                    Progress · {doneCount} of {totalCount} tasks
                  </span>
                  <span style={{ color: "var(--ink)" }}>{Math.round(progress * 100)}%</span>
                </div>
                <div style={{ height: 4, background: "var(--hairline)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${progress * 100}%`,
                      height: "100%",
                      background: "var(--accent)",
                      transition: "width 200ms ease-out",
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {quickAddOpen && (
            <div
              style={{
                marginBottom: 18,
                padding: "10px 12px",
                border: "1px solid var(--accent)",
                borderRadius: 4,
                background: "color-mix(in oklch, var(--accent) 5%, var(--paper))",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <input
                ref={quickAddRef}
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitQuickAdd();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setQuickAddOpen(false);
                    setQuickAddText("");
                  }
                }}
                placeholder="New task in this project — ⏎ to add, esc to close"
                disabled={adding}
                style={{
                  flex: 1,
                  fontFamily: "var(--serif)",
                  fontSize: 16,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--ink)",
                }}
              />
              <button
                onClick={() => void submitQuickAdd()}
                disabled={adding || !quickAddText.trim()}
                style={{
                  ...btnPrimary,
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: adding || !quickAddText.trim() ? 0.5 : 1,
                }}
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          )}
          <TaskGroup label="Active" tasks={groups.active} onToggle={toggleDone} emptyHint="No active tasks. Capture or assign one to this project." />
          {groups.waiting.length > 0 && (
            <TaskGroup label="Waiting on others" tasks={groups.waiting} onToggle={toggleDone} />
          )}
          {groups.done.length > 0 && (
            <CollapsibleTaskGroup
              label="Done · this week"
              tasks={groups.done}
              onToggle={toggleDone}
              muted
            />
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <div
            style={{
              padding: "14px 16px",
              border: "1px dashed var(--hairline)",
              borderRadius: 4,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 6,
              }}
            >
              Linked items
            </div>
            <p
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
                color: "var(--ink)",
              }}
            >
              Issues and conversations from Linear, Jira, Gmail and Slack will land here once
              integrations ship.
            </p>
          </div>
          <ReleaseTimeline projectId={project.id} />
        </aside>
      </div>
    </BriefingShell>
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
        Project not found.
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

interface GroupProps {
  label: string;
  tasks: Task[];
  onToggle: (id: string) => Promise<void>;
  muted?: boolean;
  emptyHint?: string;
}

/** Closed-by-default variant for high-volume task groups (e.g. completed
 *  tasks). At scale the project can have thousands of done rows — rendering
 *  them collapsed avoids the extra DOM/layout cost until the user actually
 *  wants to see history. */
function CollapsibleTaskGroup(props: GroupProps) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ marginBottom: 28, opacity: props.muted ? 0.7 : 1 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <span aria-hidden="true" style={{ width: 10, textAlign: "center" }}>
          {open ? "▾" : "▸"}
        </span>
        <span>
          {props.label} · {props.tasks.length}
        </span>
      </button>
      {open && (
        <TaskGroup
          label={props.label}
          tasks={props.tasks}
          onToggle={props.onToggle}
          muted={props.muted}
          // We render our own toggle header; suppress the inner label.
          hideHeader
        />
      )}
    </section>
  );
}

function TaskGroup({
  label,
  tasks,
  onToggle,
  muted,
  emptyHint,
  hideHeader,
}: GroupProps & { hideHeader?: boolean }) {
  if (tasks.length === 0 && !emptyHint) return null;
  return (
    <section style={{ marginBottom: 28, opacity: muted ? 0.7 : 1 }}>
      {!hideHeader && <SectionLabel label={`${label} · ${tasks.length}`} />}
      {tasks.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            color: "var(--muted)",
            fontSize: 14,
            padding: "12px 0",
          }}
        >
          {emptyHint}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {tasks.map((t, i) => (
            <li
              key={t.id}
              data-row
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                borderBottom: i < tasks.length - 1 ? "1px solid var(--hairline)" : "none",
                alignItems: "center",
              }}
            >
              <Checkbox
                checked={t.status === "done"}
                onClick={() => void onToggle(t.id)}
              />
              <Link
                to={`/task/${t.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: t.status === "done" ? "var(--muted)" : "var(--ink)",
                    textDecoration: t.status === "done" ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "var(--muted)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginTop: 3,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <PriorityMark p={t.priority} size={7} />
                  {t.priority}
                  {t.integration && (
                    <>
                      <span>·</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <SourceIcon source={t.integration} size={9} />
                        {t.integrationId || t.integration}
                      </span>
                    </>
                  )}
                </div>
              </Link>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: t.dueText?.startsWith("Today") ? "var(--accent)" : "var(--muted)",
                }}
              >
                {t.dueText ?? ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Project import is used implicitly via memo'd selectors; nothing else needed here.
export type { Project };
