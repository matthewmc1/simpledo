import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Project, Task } from "@shared/types";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { PriorityMark } from "../components/PriorityMark";
import { useCalendarRecommendStore } from "../stores/calendarRecommendStore";
import { useCaptureModal } from "../stores/captureStore";
import { useEnsureProjectsLoaded, useProjectStore } from "../stores/projectStore";
import { useEnsureTasksLoaded, useTaskStore } from "../stores/taskStore";
import { useTweaks } from "../tweaks/TweaksProvider";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ViewMode = "week" | "day";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date): Date {
  // Monday-first week.
  const c = startOfDay(d);
  const offset = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - offset);
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatRange(viewMode: ViewMode, anchor: Date): string {
  if (viewMode === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  const monday = startOfWeek(anchor);
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.toLocaleDateString(undefined, { month: "long" })} ${monday.getDate()} – ${sunday.getDate()}`;
  }
  return `${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

interface CalendarTask extends Task {
  /** Resolved due date (start of day) for grouping. */
  dueDate: Date;
}

export function WeekView() {
  useEnsureTasksLoaded();
  useEnsureProjectsLoaded();

  const { tweaks } = useTweaks();
  const showBanner = tweaks.aiProminence !== "quiet";

  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const today = useMemo(() => startOfDay(new Date()), []);

  // Visible days: 7 in week mode, 1 in day mode.
  const visibleDays = useMemo<Date[]>(() => {
    if (viewMode === "day") return [startOfDay(anchor)];
    const monday = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [viewMode, anchor]);

  const rangeFrom = visibleDays[0];
  const rangeTo = visibleDays[visibleDays.length - 1];

  const projectsById = useMemo(
    () => new Map<string, Project>(projects.map((p) => [p.id, p])),
    [projects],
  );

  const scheduledTasks = useMemo<CalendarTask[]>(() => {
    return tasks
      .filter((t) => t.due && t.status !== "done")
      .map((t) => ({ ...t, dueDate: startOfDay(new Date(t.due!)) }))
      .filter((t) => t.dueDate >= rangeFrom && t.dueDate <= addDays(rangeTo, 1))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [tasks, rangeFrom, rangeTo]);

  // Group scheduled tasks by day-key for fast lookup per cell.
  const byDayKey = useMemo(() => {
    const m = new Map<string, CalendarTask[]>();
    for (const t of scheduledTasks) {
      const key = t.dueDate.toISOString();
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return m;
  }, [scheduledTasks]);

  const unscheduled = useMemo<Task[]>(() => {
    return tasks
      .filter(
        (t) =>
          !t.due &&
          (t.status === "today" || t.status === "next" || t.status === "waiting"),
      )
      .sort((a, b) => {
        // P1 first.
        const order = a.priority.localeCompare(b.priority);
        if (order !== 0) return order;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [tasks]);

  // AI recommendations
  const recommendStatus = useCalendarRecommendStore((s) => s.status);
  const recommend = useCalendarRecommendStore((s) => s.recommend);
  const recommendError = useCalendarRecommendStore((s) => s.error);
  const lastKey = useCalendarRecommendStore((s) => s.lastKey);
  const generateRecommend = useCalendarRecommendStore((s) => s.generate);

  useEffect(() => {
    if (!showBanner) return;
    const fromIso = rangeFrom.toISOString();
    const toIso = addDays(rangeTo, 1).toISOString();
    const key = `${fromIso}|${toIso}`;
    if (lastKey === key) return; // already generated for this range
    if (recommendStatus === "streaming") return;
    void generateRecommend(fromIso, toIso);
  }, [showBanner, rangeFrom, rangeTo, lastKey, recommendStatus, generateRecommend]);

  const eyebrow = useMemo(() => {
    const taskCount = scheduledTasks.length;
    return `${viewMode === "week" ? "Week" : "Day"} · ${taskCount} scheduled · ${unscheduled.length} unscheduled`;
  }, [scheduledTasks.length, unscheduled.length, viewMode]);

  const stepBack = () => setAnchor((a) => addDays(a, viewMode === "week" ? -7 : -1));
  const stepForward = () => setAnchor((a) => addDays(a, viewMode === "week" ? 7 : 1));
  const goToday = () => setAnchor(new Date());

  return (
    <BriefingShell>
      <ViewHeader
        eyebrow={eyebrow}
        title={
          <>
            {viewMode === "week" ? "Week of " : ""}
            <em style={{ fontStyle: "italic" }}>{formatRange(viewMode, anchor)}</em>
          </>
        }
        actions={
          <>
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <button style={btnGhost} onClick={stepBack} aria-label="Previous">
              ←
            </button>
            <button style={btnGhost} onClick={goToday}>
              Today
            </button>
            <button style={btnGhost} onClick={stepForward} aria-label="Next">
              →
            </button>
            <button style={btnPrimary} onClick={() => setCaptureOpen(true)}>
              ⌘K · Capture
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 40px 40px" }}>
        {showBanner && (
          <RecommendBanner
            status={recommendStatus}
            recommend={recommend}
            error={recommendError}
            rangeLabel={formatRange(viewMode, anchor)}
            onRegenerate={() =>
              void generateRecommend(
                rangeFrom.toISOString(),
                addDays(rangeTo, 1).toISOString(),
              )
            }
          />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: viewMode === "week" ? "repeat(7, 1fr)" : "1fr",
            border: "1px solid var(--hairline)",
            borderRadius: 4,
            overflow: "hidden",
            background: "var(--paper)",
          }}
        >
          {visibleDays.map((d) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              isToday={sameDay(d, today)}
              tasks={byDayKey.get(d.toISOString()) ?? []}
              projectsById={projectsById}
              singleColumn={viewMode === "day"}
            />
          ))}
        </div>

        <UnscheduledRail tasks={unscheduled} projectsById={projectsById} />
      </div>
    </BriefingShell>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options: ViewMode[] = ["day", "week"];
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--hairline)",
        borderRadius: 3,
        overflow: "hidden",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {options.map((v, i) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          style={{
            padding: "6px 14px",
            background: value === v ? "var(--ink)" : "transparent",
            color: value === v ? "var(--paper)" : "var(--ink)",
            border: "none",
            borderRight: i < options.length - 1 ? "1px solid var(--hairline)" : "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            letterSpacing: "inherit",
            textTransform: "inherit",
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

interface DayColumnProps {
  day: Date;
  isToday: boolean;
  tasks: CalendarTask[];
  projectsById: Map<string, Project>;
  singleColumn: boolean;
}

function DayColumn({ day, isToday, tasks, projectsById, singleColumn }: DayColumnProps) {
  const weekday = WEEKDAY_SHORT[(day.getDay() + 6) % 7];
  return (
    <div
      style={{
        borderLeft: "1px solid var(--hairline)",
        background: isToday
          ? "color-mix(in oklch, var(--accent) 4%, var(--paper))"
          : "var(--paper)",
        minHeight: singleColumn ? 480 : 320,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          background: isToday
            ? "color-mix(in oklch, var(--accent) 8%, var(--paper))"
            : "transparent",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: isToday ? "var(--accent)" : "var(--muted)",
          }}
        >
          {weekday}
        </span>
        <span
          style={{
            fontFamily: "var(--serif)",
            fontSize: 16,
            color: isToday ? "var(--accent)" : "var(--ink)",
          }}
        >
          {day.getDate()}
        </span>
        {isToday && (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginLeft: "auto",
            }}
          >
            Today
          </span>
        )}
      </header>

      <div
        style={{
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
        }}
      >
        {tasks.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--muted)",
              margin: 0,
              padding: "8px 4px",
            }}
          >
            {isToday ? "Open day." : "—"}
          </p>
        ) : (
          tasks.map((t) => (
            <TaskChip key={t.id} task={t} projectsById={projectsById} large={singleColumn} />
          ))
        )}
      </div>
    </div>
  );
}

interface ChipProps {
  task: CalendarTask;
  projectsById: Map<string, Project>;
  large?: boolean;
}

function TaskChip({ task, projectsById, large }: ChipProps) {
  const project = task.projectId ? projectsById.get(task.projectId) : null;
  const color = project?.color ?? "var(--accent)";

  return (
    <Link
      to={`/task/${task.id}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        padding: large ? "10px 12px" : "6px 8px",
        background: `color-mix(in oklch, ${color} 10%, var(--paper))`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        display: "block",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 2,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <PriorityMark p={task.priority} size={6} />
        {task.priority}
        {project && (
          <>
            <span>·</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {project.name}
            </span>
          </>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--ui)",
          fontSize: large ? 14 : 12,
          fontWeight: 500,
          lineHeight: 1.3,
          color: "var(--ink)",
        }}
      >
        {task.title}
      </div>
    </Link>
  );
}

interface UnscheduledProps {
  tasks: Task[];
  projectsById: Map<string, Project>;
}

function UnscheduledRail({ tasks, projectsById }: UnscheduledProps) {
  if (tasks.length === 0) {
    return (
      <div
        style={{
          marginTop: 22,
          padding: "14px 18px",
          border: "1px dashed var(--hairline)",
          borderRadius: 4,
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--muted)",
          fontSize: 14,
        }}
      >
        Everything has a date — nothing waiting in the wings.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 22,
        padding: "14px 18px",
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <span>Unscheduled · open</span>
        <span>
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tasks.map((t) => {
          const project = t.projectId ? projectsById.get(t.projectId) : null;
          const color = project?.color ?? "var(--muted)";
          return (
            <Link
              key={t.id}
              to={`/task/${t.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                padding: "8px 12px",
                border: `1px dashed ${color}`,
                borderRadius: 3,
                background: `color-mix(in oklch, ${color} 8%, var(--paper))`,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
              <span style={{ color: "var(--ink)" }}>{t.title}</span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                }}
              >
                · {t.priority}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface BannerProps {
  status: "idle" | "streaming" | "ready" | "error";
  recommend: string;
  error: string | null;
  rangeLabel: string;
  onRegenerate: () => void;
}

function RecommendBanner({ status, recommend, error, rangeLabel, onRegenerate }: BannerProps) {
  const streaming = status === "streaming";
  const errored = status === "error";
  const idle = status === "idle";
  if (idle && !recommend) return null;

  return (
    <section
      style={{
        padding: "18px 22px",
        background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
        border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
        borderRadius: 4,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: errored ? "var(--muted)" : "var(--accent)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: errored ? "var(--muted)" : "var(--accent)",
              animation: streaming ? "pulse 1.4s infinite" : "none",
            }}
          />
          {errored
            ? "Gemma offline"
            : streaming
              ? `Drafting your plan for ${rangeLabel}…`
              : `Gemma's read of ${rangeLabel}`}
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={streaming}
          style={{
            background: "transparent",
            border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
            color: "var(--accent)",
            padding: "4px 10px",
            borderRadius: 3,
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: streaming ? "default" : "pointer",
            opacity: streaming ? 0.5 : 1,
          }}
        >
          {streaming ? "Drafting…" : "Regenerate"}
        </button>
      </div>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 16,
          lineHeight: 1.5,
          margin: 0,
          color: "var(--ink)",
          minHeight: 22,
        }}
      >
        {recommend || (streaming ? "" : errored ? error || "Could not reach Gemma." : "")}
      </p>
    </section>
  );
}
