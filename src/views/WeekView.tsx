import { Fragment } from "react";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { useTweaks } from "../tweaks/TweaksProvider";

interface Day {
  name: string;
  date: number;
  today: boolean;
  label?: string;
}

interface Block {
  kind: "E" | "T";
  start: number;
  dur: number;
  title: string;
  project?: string;
  color?: string;
  c?: string;
  done?: boolean;
  focus?: boolean;
  suggested?: boolean;
}

export function WeekView() {
  const { tweaks } = useTweaks();
  const showBanner = tweaks.aiProminence !== "quiet";
  const loud = tweaks.aiProminence === "loud";

  const days: Day[] = [
    { name: "Mon", date: 11, today: false },
    { name: "Tue", date: 12, today: true },
    { name: "Wed", date: 13, today: false },
    { name: "Thu", date: 14, today: false },
    { name: "Fri", date: 15, today: false, label: "Weekly review" },
  ];
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

  const blocks: Record<string, Block[]> = {
    Mon: [
      { kind: "E", start: 9, dur: 0.25, title: "Standup", color: "var(--muted)" },
      { kind: "T", start: 9.5, dur: 1.5, title: "Q2 retention readout", project: "Retention Q3", c: "#a85a2c", done: true },
      { kind: "E", start: 14, dur: 0.5, title: "Diane 1:1", color: "var(--muted)" },
    ],
    Tue: [
      { kind: "E", start: 9.5, dur: 0.25, title: "Standup", color: "var(--muted)" },
      { kind: "T", start: 10, dur: 1, title: "Spec hand-off (LIN-2812)", project: "Onboarding v2", c: "#2d5a3d", focus: true },
      { kind: "E", start: 11, dur: 0.75, title: "Onboarding v2 spec review", color: "var(--ink)" },
      { kind: "T", start: 12.5, dur: 0.75, title: "Pricing memo", project: "Board prep", c: "#5a3da8" },
      { kind: "E", start: 14, dur: 0.5, title: "Pricing review w/ Diane", color: "var(--ink)" },
      { kind: "T", start: 15, dur: 0.5, title: "Approve metric defs", project: "Retention Q3", c: "#a85a2c" },
      { kind: "E", start: 16, dur: 0.5, title: "1:1 Wren", color: "var(--muted)" },
    ],
    Wed: [
      { kind: "E", start: 9.5, dur: 0.25, title: "Standup", color: "var(--muted)" },
      { kind: "T", start: 10, dur: 2, title: "Reconcile board narrative", project: "Board prep", c: "#5a3da8", suggested: true },
      { kind: "E", start: 13, dur: 1, title: "Customer call · Acme", color: "var(--ink)" },
      { kind: "E", start: 15, dur: 0.5, title: "1:1 Sasha", color: "var(--muted)" },
    ],
    Thu: [
      { kind: "E", start: 9.5, dur: 0.25, title: "Standup", color: "var(--muted)" },
      { kind: "E", start: 10, dur: 1, title: "Platform review", color: "var(--ink)" },
      { kind: "T", start: 13, dur: 1, title: "Sync w/ Sasha on dashboard", project: "Retention Q3", c: "#a85a2c", suggested: true },
      { kind: "E", start: 15, dur: 0.5, title: "1:1 Devon", color: "var(--muted)" },
    ],
    Fri: [
      { kind: "T", start: 9, dur: 1.5, title: "Weekly review", project: "Review", c: "var(--accent)", focus: true },
      { kind: "E", start: 11, dur: 0.5, title: "All-hands", color: "var(--ink)" },
      { kind: "T", start: 14, dur: 1, title: "Personal admin", project: "Personal", c: "#b8843d", suggested: true },
    ],
  };

  const unscheduled = [
    { t: "Reply to Marcus", project: "Board prep", c: "#5a3da8", est: "10m" },
    { t: "Annual eye exam", project: "Personal", c: "#b8843d", est: "5m" },
    { t: "Migration plan draft", project: "Platform", c: "var(--muted)", est: "1h" },
  ];

  const rowH = 32;
  const colHeaderH = 56;
  const trackH = rowH * hours.length * 2;

  return (
    <BriefingShell>
      <ViewHeader
        eyebrow="Week of May 11 · 5 day view · 4 meetings · 6 time-blocked tasks"
        title={
          <>
            Week of <em style={{ fontStyle: "italic" }}>May 11</em>
          </>
        }
        actions={
          <>
            {loud && (
              <button style={{ ...btnGhost, color: "var(--accent)", borderColor: "var(--accent)" }}>
                ✦ Ask Gemma
              </button>
            )}
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
              {["Day", "Week", "Month"].map((v, i) => (
                <span
                  key={v}
                  style={{
                    padding: "6px 12px",
                    background: i === 1 ? "var(--ink)" : "transparent",
                    color: i === 1 ? "var(--paper)" : "var(--ink)",
                    cursor: "pointer",
                    borderRight: i < 2 ? "1px solid var(--hairline)" : "none",
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
            <button style={btnGhost}>← This week</button>
            <button style={btnPrimary}>+ Block time</button>
          </>
        }
      />

      <div style={{ padding: "20px 40px 28px" }}>
        {showBanner && (
          <div
            style={{
              padding: "12px 18px",
              background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
              border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
              borderRadius: 4,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--paper)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--mono)",
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              ✦
            </span>
            <div
              style={{
                flex: 1,
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              "Three unscheduled tasks total 1h 15m. I found three open windows that fit —{" "}
              <strong style={{ fontStyle: "normal" }}>Wed 10am, Thu 1pm, Fri 2pm</strong>. Want me to block them?"
            </div>
            <button style={{ ...btnGhost, padding: "5px 12px", fontSize: 12 }}>Show me</button>
            <button
              style={{
                background: "var(--ink)",
                color: "var(--paper)",
                border: "none",
                padding: "6px 14px",
                borderRadius: 3,
                fontFamily: "var(--ui)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Block all
            </button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px repeat(5, 1fr)",
            border: "1px solid var(--hairline)",
            borderRadius: 4,
            overflow: "hidden",
            background: "var(--paper)",
          }}
        >
          <div style={{ height: colHeaderH, borderBottom: "1px solid var(--hairline)" }} />
          {days.map((d) => (
            <div
              key={d.name}
              style={{
                height: colHeaderH,
                padding: "10px 12px",
                borderBottom: "1px solid var(--hairline)",
                borderLeft: "1px solid var(--hairline)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: d.today
                  ? "color-mix(in oklch, var(--accent) 4%, var(--paper))"
                  : "transparent",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: d.today ? "var(--accent)" : "var(--muted)",
                }}
              >
                {d.name} · May {d.date} {d.today && <span style={{ marginLeft: 4 }}>· today</span>}
              </div>
              {d.label && (
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    fontSize: 13,
                    color: "var(--accent)",
                    marginTop: 2,
                  }}
                >
                  {d.label}
                </div>
              )}
            </div>
          ))}

          <div style={{ position: "relative", height: trackH, borderRight: "1px solid var(--hairline)" }}>
            {hours.map((h, i) => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: i * rowH * 2 - 6,
                  right: 6,
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--muted)",
                }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d.name}
              style={{
                position: "relative",
                height: trackH,
                borderLeft: "1px solid var(--hairline)",
                background: d.today
                  ? "color-mix(in oklch, var(--accent) 2%, var(--paper))"
                  : "transparent",
              }}
            >
              {hours.map((h, i) => (
                <Fragment key={h}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: i * rowH * 2,
                      borderTop: "1px solid var(--hairline)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: i * rowH * 2 + rowH,
                      borderTop: "1px dotted color-mix(in oklch, var(--hairline) 40%, transparent)",
                    }}
                  />
                </Fragment>
              ))}
              {d.today && (
                <div
                  style={{
                    position: "absolute",
                    left: -2,
                    right: 0,
                    top: (9.05 - hours[0]) * rowH * 2,
                    borderTop: "1.5px solid var(--accent)",
                    zIndex: 3,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: -5,
                      top: -5,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--accent)",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 4,
                      top: -16,
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      color: "var(--accent)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    9:03
                  </span>
                </div>
              )}
              {(blocks[d.name] || []).map((b, i) => {
                const top = (b.start - hours[0]) * rowH * 2;
                const height = b.dur * rowH * 2 - 2;
                const isTask = b.kind === "T";
                const sugg = b.suggested;
                const c = b.c || "var(--accent)";
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: 4,
                      right: 4,
                      top,
                      height,
                      borderRadius: 3,
                      padding: "5px 8px",
                      background: isTask
                        ? sugg
                          ? "transparent"
                          : `color-mix(in oklch, ${c} 18%, var(--paper))`
                        : b.color === "var(--ink)"
                        ? "var(--ink)"
                        : "color-mix(in oklch, var(--ink) 8%, var(--paper))",
                      color: !isTask && b.color === "var(--ink)" ? "var(--paper)" : "var(--ink)",
                      border: isTask
                        ? sugg
                          ? `1.5px dashed ${c}`
                          : `1px solid ${c}`
                        : b.color === "var(--ink)"
                        ? "none"
                        : "1px solid var(--hairline)",
                      borderLeft: isTask && !sugg ? `3px solid ${c}` : undefined,
                      overflow: "hidden",
                      fontSize: 11,
                      lineHeight: 1.25,
                      cursor: "pointer",
                      boxShadow: b.focus ? `0 0 0 2px color-mix(in oklch, ${c} 50%, transparent)` : "none",
                      opacity: b.done ? 0.55 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        opacity: 0.75,
                        marginBottom: 1,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{isTask ? (sugg ? "Gemma blocks" : "Task") : "Meeting"}</span>
                      {b.focus && <span>· focus</span>}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--ui)",
                        fontSize: 12,
                        fontWeight: 500,
                        textDecoration: b.done ? "line-through" : "none",
                      }}
                    >
                      {b.title}
                    </div>
                    {b.project && height > 50 && (
                      <div style={{ marginTop: 2, fontSize: 10, opacity: 0.7 }}>{b.project}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
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
              Unscheduled · drag onto calendar
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
              {unscheduled.length} tasks · 1h 15m
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {unscheduled.map((u, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  border: `1px dashed ${u.c}`,
                  borderRadius: 3,
                  background: `color-mix(in oklch, ${u.c} 8%, var(--paper))`,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "grab",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.c }} />
                <span>{u.t}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>· {u.est}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BriefingShell>
  );
}
