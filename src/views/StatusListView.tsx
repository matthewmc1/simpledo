import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Project, Status, Task } from "@shared/types";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost } from "../components/briefing/buttons";
import { Checkbox } from "../components/Checkbox";
import { PriorityMark } from "../components/PriorityMark";
import { SourceIcon } from "../components/SourceIcon";
import { useCaptureModal } from "../stores/captureStore";
import { useEnsureProjectsLoaded, useProjectStore } from "../stores/projectStore";
import { useEnsureTasksLoaded, useTaskStore } from "../stores/taskStore";

type ListStatus = Extract<Status, "next" | "waiting" | "someday">;

interface ListConfig {
  status: ListStatus;
  title: string;
  eyebrow: string;
  emptyTitle: string;
  emptyBody: string;
  /** Status to promote a task into when the primary action is hit. */
  promoteTo: Status;
  promoteLabel: string;
  /** Secondary action (often "send to someday" for next, "send to next" for someday). */
  secondaryTo?: Status;
  secondaryLabel?: string;
}

const CONFIGS: Record<ListStatus, ListConfig> = {
  next: {
    status: "next",
    title: "Next.",
    eyebrow: "On deck",
    emptyTitle: "Nothing on deck.",
    emptyBody:
      "When something doesn't need doing today but isn't a maybe, send it here. Press ⌘K to capture, or process your inbox.",
    promoteTo: "today",
    promoteLabel: "Move to Today",
    secondaryTo: "someday",
    secondaryLabel: "Defer",
  },
  waiting: {
    status: "waiting",
    title: "Waiting on others.",
    eyebrow: "Blocked on someone else",
    emptyTitle: "Nothing waiting.",
    emptyBody:
      "When you've handed something off and need a reply or a deliverable, mark it Waiting so you can come back to it without re-thinking.",
    promoteTo: "today",
    promoteLabel: "Unblocked → Today",
    secondaryTo: "next",
    secondaryLabel: "Back to Next",
  },
  someday: {
    status: "someday",
    title: "Someday / maybe.",
    eyebrow: "Parking lot",
    emptyTitle: "Empty parking lot.",
    emptyBody:
      "Ideas you want to keep but not act on now live here. Capture freely with ⌘K — you can promote anything later.",
    promoteTo: "next",
    promoteLabel: "Promote to Next",
    secondaryTo: "today",
    secondaryLabel: "Do today",
  },
};

function StatusListView({ status }: { status: ListStatus }) {
  useEnsureTasksLoaded();
  useEnsureProjectsLoaded();

  const cfg = CONFIGS[status];
  const tasks = useTaskStore((s) => s.tasks);
  const taskStatus = useTaskStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const setTaskStatus = useTaskStore((s) => s.setStatus);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);

  const projectsById = useMemo(
    () => new Map<string, Project>(projects.map((p) => [p.id, p])),
    [projects],
  );

  const ownTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === status)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [tasks, status],
  );

  const loading = taskStatus === "loading" && ownTasks.length === 0;
  const empty = !loading && ownTasks.length === 0;

  return (
    <BriefingShell>
      <ViewHeader
        eyebrow={`${cfg.eyebrow} · ${ownTasks.length} task${ownTasks.length === 1 ? "" : "s"}`}
        title={cfg.title}
        actions={
          <button style={btnGhost} onClick={() => setCaptureOpen(true)}>
            ⌘K · Capture
          </button>
        }
      />

      <div style={{ padding: "24px 40px 40px" }}>
        {loading ? (
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Loading…
          </div>
        ) : empty ? (
          <EmptyState title={cfg.emptyTitle} body={cfg.emptyBody} />
        ) : (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              overflow: "hidden",
              background: "var(--paper)",
            }}
          >
            {ownTasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                projectName={t.projectId ? projectsById.get(t.projectId)?.name ?? "" : ""}
                projectColor={t.projectId ? projectsById.get(t.projectId)?.color ?? "" : ""}
                divider={i < ownTasks.length - 1}
                onToggleDone={() => void toggleDone(t.id)}
                onPromote={() => void setTaskStatus(t.id, cfg.promoteTo)}
                promoteLabel={cfg.promoteLabel}
                onSecondary={
                  cfg.secondaryTo
                    ? () => void setTaskStatus(t.id, cfg.secondaryTo!)
                    : undefined
                }
                secondaryLabel={cfg.secondaryLabel}
                onDelete={() => {
                  if (confirm(`Delete "${t.title}"?`)) void deleteTask(t.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </BriefingShell>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        border: "1px dashed var(--hairline)",
        borderRadius: 4,
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontWeight: 400,
          fontSize: 28,
          margin: "0 0 12px",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 15,
          lineHeight: 1.5,
          color: "var(--muted)",
          margin: "0 auto",
          maxWidth: 480,
        }}
      >
        {body}
      </p>
    </div>
  );
}

interface RowProps {
  task: Task;
  projectName: string;
  projectColor: string;
  divider: boolean;
  onToggleDone: () => void;
  onPromote: () => void;
  promoteLabel: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
  onDelete: () => void;
}

function TaskRow({
  task,
  projectName,
  projectColor,
  divider,
  onToggleDone,
  onPromote,
  promoteLabel,
  onSecondary,
  secondaryLabel,
  onDelete,
}: RowProps) {
  return (
    <li
      data-row
      style={{
        padding: "16px 20px",
        borderBottom: divider ? "1px solid var(--hairline)" : "none",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 16,
        alignItems: "center",
        background: "var(--paper)",
      }}
    >
      <Checkbox checked={task.status === "done"} onClick={onToggleDone} />

      <Link
        to={`/task/${task.id}`}
        style={{
          textDecoration: "none",
          color: "inherit",
          minWidth: 0,
          display: "block",
        }}
      >
        <div style={{ fontSize: 15, lineHeight: 1.3, marginBottom: 4, color: "var(--ink)" }}>
          {task.title}
        </div>
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <PriorityMark p={task.priority} size={7} />
            {task.priority}
          </span>
          {projectName && (
            <>
              <span>·</span>
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
          {task.dueText && (
            <>
              <span>·</span>
              <span style={{ color: "var(--accent)" }}>{task.dueText}</span>
            </>
          )}
        </div>
      </Link>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={onPromote}
          style={{
            ...btnGhost,
            padding: "5px 10px",
            fontSize: 11,
            borderColor: "var(--accent)",
            color: "var(--accent)",
          }}
        >
          {promoteLabel}
        </button>
        {onSecondary && secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          title="Delete"
          style={{
            background: "transparent",
            border: "1px solid var(--hairline)",
            color: "var(--muted)",
            width: 26,
            height: 26,
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function NextView() {
  return <StatusListView status="next" />;
}

export function WaitingView() {
  return <StatusListView status="waiting" />;
}

export function SomedayView() {
  return <StatusListView status="someday" />;
}
