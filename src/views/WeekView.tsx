import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Project, Task } from "@shared/types";
import { signInGoogle } from "../auth/api";
import { useSession } from "../auth/SessionProvider";
import type { GoogleEvent } from "../api/google";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { PriorityMark } from "../components/PriorityMark";
import { useCalendarRecommendStore } from "../stores/calendarRecommendStore";
import { useCaptureModal } from "../stores/captureStore";
import { useGoogleCalendarStore } from "../stores/googleCalendarStore";
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

  // Google Calendar (read-only). We only call /api/google/status for real
  // accounts — the demo sandbox doesn't have a Google linkage.
  const googleStatus = useGoogleCalendarStore((s) => s.status);
  const loadGoogleStatus = useGoogleCalendarStore((s) => s.loadStatus);
  const loadGoogleEvents = useGoogleCalendarStore((s) => s.loadEvents);
  const googleEvents = useGoogleCalendarStore((s) => s.events);
  const googleLoadingEvents = useGoogleCalendarStore((s) => s.loadingEvents);
  const { state: sessionState } = useSession();
  const isDemoUser =
    sessionState.status === "authenticated" && sessionState.user.isDemo;

  useEffect(() => {
    if (sessionState.status !== "authenticated" || isDemoUser) return;
    if (googleStatus === null) void loadGoogleStatus();
  }, [sessionState, isDemoUser, googleStatus, loadGoogleStatus]);

  useEffect(() => {
    if (!googleStatus?.calendarScopeGranted) return;
    const fromIso = rangeFrom.toISOString();
    const toIso = addDays(rangeTo, 1).toISOString();
    void loadGoogleEvents(fromIso, toIso);
  }, [googleStatus?.calendarScopeGranted, rangeFrom, rangeTo, loadGoogleEvents]);

  // Group events by day-key for the same lookup the task grid uses. We
  // deliberately use ONLY the live googleEvents array — there is no demo /
  // fixture calendar. A user who hasn't connected Google sees task chips and
  // nothing else; the connect CTA banner is the only "calendar" affordance
  // until they grant access.
  const eventsByDayKey = useMemo(() => {
    const m = new Map<string, GoogleEvent[]>();
    const showEvents = !!googleStatus?.calendarScopeGranted;
    if (!showEvents) return m;
    for (const e of googleEvents) {
      const day = startOfDay(new Date(e.start));
      const key = day.toISOString();
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    return m;
  }, [googleEvents, googleStatus?.calendarScopeGranted]);

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
        {!isDemoUser && googleStatus && (
          <GoogleConnectBanner
            status={googleStatus}
            loadingEvents={googleLoadingEvents}
            eventCount={googleEvents.length}
          />
        )}
        {isDemoUser && <DemoNotice />}

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
            // `minmax(0, 1fr)` instead of bare `1fr` so long chip titles can't
            // widen their own column. Without this, `1fr` resolves to
            // `minmax(auto, 1fr)` which respects intrinsic content width.
            gridTemplateColumns:
              viewMode === "week" ? "repeat(7, minmax(0, 1fr))" : "minmax(0, 1fr)",
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
              events={eventsByDayKey.get(d.toISOString()) ?? []}
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
  events: GoogleEvent[];
  projectsById: Map<string, Project>;
  singleColumn: boolean;
}

function DayColumn({ day, isToday, tasks, events, projectsById, singleColumn }: DayColumnProps) {
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
        // Don't let chip contents expand the column past its grid track.
        minWidth: 0,
        overflow: "hidden",
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
        {events.map((e) => (
          <EventChip key={e.id} event={e} large={singleColumn} />
        ))}
        {tasks.length === 0 && events.length === 0 ? (
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

function EventChip({ event, large }: { event: GoogleEvent; large?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const timeLabel = event.allDay
    ? "All day"
    : new Date(event.start).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
  const timeRangeLabel = event.allDay
    ? "All day"
    : `${timeLabel} – ${new Date(event.end).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;
  const tooltip = [event.title, event.location, event.calendarName]
    .filter(Boolean)
    .join(" · ");

  // Show the disclosure chevron whenever there's *something* extra beyond the
  // title — time range, calendar name, location, description, or a Google
  // link to deep-link out to.
  const hasPreviewExtras = !!(
    event.location ||
    event.description ||
    event.htmlLink ||
    !event.allDay ||
    event.calendarName
  );

  return (
    <div
      style={{
        background: "color-mix(in oklch, var(--ink) 4%, var(--paper))",
        border: "1px solid var(--hairline)",
        borderRadius: 3,
        // Two-tone left edge so events are scannable even when the column is
        // narrow and the title gets truncated.
        boxShadow: "inset 3px 0 0 var(--muted)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={tooltip}
        aria-expanded={expanded}
        style={{
          width: "100%",
          padding: large ? "8px 12px 8px 14px" : "5px 8px 5px 11px",
          background: "transparent",
          border: "none",
          color: "var(--ink)",
          cursor: hasPreviewExtras ? "pointer" : "default",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          minHeight: large ? 36 : 28,
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.04em",
            color: "var(--muted)",
            flexShrink: 0,
            minWidth: large ? 56 : 44,
          }}
        >
          {timeLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: large ? 14 : 12,
            lineHeight: 1.3,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {event.title}
        </span>
        {hasPreviewExtras && (
          <span
            style={{
              color: "var(--muted)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {expanded ? "▴" : "▾"}
          </span>
        )}
      </button>

      {expanded && (
        <div
          style={{
            padding: large ? "0 12px 10px 14px" : "0 8px 8px 11px",
            borderTop: "1px dotted var(--hairline)",
            paddingTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.05em",
              color: "var(--muted)",
            }}
          >
            {timeRangeLabel}
            {event.calendarName ? ` · ${event.calendarName}` : ""}
          </div>
          {event.location && (
            <div
              style={{
                fontFamily: "var(--ui)",
                fontSize: 12,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              📍 {event.location}
            </div>
          )}
          {event.description && (
            <div
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--ink)",
                // Three-line preview; user can open in Google for the full body.
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }}
            >
              {event.description}
            </div>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--accent)",
                textDecoration: "none",
                alignSelf: "flex-start",
              }}
            >
              Open in Google ↗
            </a>
          )}
        </div>
      )}
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

function GoogleConnectBanner({
  status,
  loadingEvents,
  eventCount,
}: {
  status: { connected: boolean; calendarScopeGranted: boolean; code?: string };
  loadingEvents: boolean;
  eventCount: number;
}) {
  // Three states:
  // 1. Connected + scope granted  → quiet status pill ("Google · 5 events" or syncing).
  // 2. Connected but no scope     → reconnect-to-grant-scope.
  // 3. Not connected              → connect CTA.

  if (status.connected && status.calendarScopeGranted) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: "8px 14px",
          border: "1px solid var(--hairline)",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#2d7a4c",
              animation: loadingEvents ? "pulse 1.4s infinite" : "none",
            }}
          />
          Google Calendar ·{" "}
          {loadingEvents
            ? "syncing…"
            : `${eventCount} event${eventCount === 1 ? "" : "s"} this range`}
        </span>
      </div>
    );
  }

  const needsReconsent = status.connected && !status.calendarScopeGranted;
  const headline = needsReconsent
    ? "Grant calendar access to see your events here."
    : "Connect Google Calendar to see your events alongside your tasks.";
  const cta = needsReconsent ? "Reconnect Google" : "Connect Google";
  const subhint = needsReconsent
    ? "We added the read-only calendar scopes after you signed up — Google needs you to grant them once."
    : "Read-only · we never write to your calendar. Your tasks stay where they are.";

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "14px 18px",
        border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
        background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: 4,
            }}
          >
            Integration · Google Calendar
          </div>
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 15,
              lineHeight: 1.4,
              margin: "0 0 4px",
              color: "var(--ink)",
            }}
          >
            {headline}
          </p>
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.04em",
              color: "var(--muted)",
              margin: 0,
            }}
          >
            {subhint}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void signInGoogle().catch((e) => {
              console.error("Google sign-in failed:", e);
              alert(e instanceof Error ? e.message : String(e));
            });
          }}
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            padding: "8px 14px",
            borderRadius: 3,
            fontFamily: "var(--ui)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {cta} →
        </button>
      </div>

      <GoogleSetupDisclosure mode={needsReconsent ? "reconnect" : "connect"} />
    </div>
  );
}

function GoogleSetupDisclosure({ mode }: { mode: "connect" | "reconnect" }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12, borderTop: "1px dotted var(--hairline)", paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--accent)",
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: 0,
        }}
      >
        {open ? "▾" : "▸"} Google Cloud Console setup
      </button>
      {open && (
        <ol
          style={{
            margin: "10px 0 0",
            paddingLeft: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontFamily: "var(--ui)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--ink)",
          }}
        >
          <li>
            On the{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials/consent"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              OAuth consent screen
            </a>
            , under <em>Scopes → Add or remove scopes</em>, add{" "}
            <code style={codeStyle}>https://www.googleapis.com/auth/calendar.readonly</code> and{" "}
            <code style={codeStyle}>https://www.googleapis.com/auth/calendar.events.readonly</code>.
          </li>
          <li>
            Enable the{" "}
            <a
              href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              Google Calendar API
            </a>{" "}
            for your project.
          </li>
          <li>
            If you don't have an OAuth client yet, create one under{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              Credentials → OAuth client ID → Web application
            </a>{" "}
            with redirect URI{" "}
            <code style={codeStyle}>http://localhost:4000/api/auth/callback/google</code>, then put
            the client ID + secret into <code style={codeStyle}>.env.local</code>.
          </li>
          {mode === "reconnect" ? (
            <li>
              Click <strong>Reconnect Google</strong> above — you'll be prompted to grant the new
              scopes. Once you accept, your events appear inline with your tasks.
            </li>
          ) : (
            <li>
              Click <strong>Connect Google</strong> above. You'll see Google's consent screen for
              read-only calendar access.
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  background: "color-mix(in oklch, var(--ink) 6%, var(--paper))",
  padding: "1px 5px",
  borderRadius: 2,
  border: "1px solid var(--hairline)",
};

function DemoNotice() {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        border: "1px dashed var(--hairline)",
        borderRadius: 4,
        fontFamily: "var(--serif)",
        fontStyle: "italic",
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      Demo accounts can't link Google Calendar. Sign in with Google to see your events here.
    </div>
  );
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
