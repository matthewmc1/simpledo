import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string | null; // ISO date string or null
  onChange: (iso: string | null) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isoLocalMidnight(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildGrid(viewMonth: Date): Date[] {
  // 6 weeks (42 cells), starting on Monday of the week containing the 1st.
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  // getDay: 0 = Sunday. We want Monday-first, so map [0..6] → [6,0,1,2,3,4,5].
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function shortLabel(d: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function DatePicker({ value, onChange }: Props) {
  const selected = useMemo(() => (value ? new Date(value) : null), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Re-anchor the view on the selected month when the dialog opens.
    const base = selected ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, selected]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = startOfDay(new Date());
  const grid = useMemo(() => buildGrid(viewMonth), [viewMonth]);

  const setMonthRelative = (delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const pick = (d: Date) => {
    onChange(isoLocalMidnight(d));
    setOpen(false);
  };

  const quickPicks: { label: string; date: Date }[] = [
    { label: "Today", date: new Date(today) },
    {
      label: "Tomorrow",
      date: (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        return d;
      })(),
    },
    {
      label: "Next week",
      date: (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 7);
        return d;
      })(),
    },
  ];

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
          <span style={{ color: selected ? "var(--ink)" : "var(--muted)", fontStyle: selected ? "normal" : "italic" }}>
            {selected ? shortLabel(selected) : "Pick a date"}
          </span>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>{open ? "▴" : "▾"}</span>
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear due date"
            title="Clear due date"
            style={{
              background: "transparent",
              border: "1px solid var(--hairline)",
              color: "var(--muted)",
              width: 28,
              height: 28,
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a date"
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            right: 0,
            width: 304,
            background: "var(--paper)",
            border: "1px solid var(--hairline)",
            borderRadius: 4,
            boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
            padding: 14,
            fontFamily: "var(--ui)",
          }}
        >
          {/* Quick picks */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {quickPicks.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => pick(q.date)}
                style={{
                  flex: 1,
                  padding: "5px 6px",
                  border: "1px solid var(--hairline)",
                  borderRadius: 3,
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--ink)",
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Month nav */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setMonthRelative(-1)}
              aria-label="Previous month"
              style={navBtn}
            >
              ‹
            </button>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 18,
                fontStyle: "italic",
                fontWeight: 400,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              onClick={() => setMonthRelative(1)}
              aria-label="Next month"
              style={navBtn}
            >
              ›
            </button>
          </div>

          {/* Weekday header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              marginBottom: 4,
            }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  textAlign: "center",
                  paddingBottom: 4,
                }}
              >
                {w[0]}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
            }}
          >
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(d, today);
              const isSelected = selected && sameDay(d, selected);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  aria-pressed={!!isSelected}
                  style={{
                    aspectRatio: "1 / 1",
                    border: isToday && !isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                    background: isSelected ? "var(--accent)" : "transparent",
                    color: isSelected
                      ? "var(--paper)"
                      : inMonth
                        ? "var(--ink)"
                        : "var(--muted)",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    padding: 0,
                    transition: "background 80ms ease-out",
                    opacity: inMonth ? 1 : 0.45,
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--hairline)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              disabled={!selected}
              style={{
                background: "transparent",
                border: "none",
                color: selected ? "var(--muted)" : "var(--hairline)",
                cursor: selected ? "pointer" : "default",
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: 0,
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: 0,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--hairline)",
  width: 26,
  height: 26,
  borderRadius: 3,
  cursor: "pointer",
  color: "var(--ink)",
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};
