import { Link } from "react-router-dom";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { SectionLabel } from "../components/briefing/SectionLabel";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { Checkbox } from "../components/Checkbox";
import { PriorityMark } from "../components/PriorityMark";
import { SourceIcon } from "../components/SourceIcon";
import { TODAY_TASKS } from "../data/fixtures";
import { useTweaks } from "../tweaks/TweaksProvider";

export function TaskDetailView() {
  const { tweaks } = useTweaks();
  const showGemma = tweaks.aiProminence !== "quiet";

  const task = TODAY_TASKS[0];
  const subtasksExpanded = [
    ...task.subtasks,
    { id: "draft-extra-1", title: "Record live walkthrough", done: false, est: "30m" },
    { id: "draft-extra-2", title: "Post recording + decision tree in #onboarding-v2", done: false, est: "10m" },
  ];

  return (
    <BriefingShell activeOverride="Onboarding v2">
      <div
        style={{
          padding: "20px 40px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Link to="/" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>
            Today
          </Link>
          <span>›</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2d5a3d" }} />
            Onboarding v2
          </span>
          <span>›</span>
          <span style={{ color: "var(--ink)" }}>LIN-2812</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/" style={{ ...btnGhost, padding: "6px 12px", textDecoration: "none" }}>
            ⌘← Back
          </Link>
          <button style={btnGhost}>Open in Linear ↗</button>
          <button style={btnPrimary}>Start focus · 25m</button>
        </div>
      </div>

      <div
        style={{
          padding: "24px 40px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 36,
        }}
      >
        <div>
          <header style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <PriorityMark p="P1" size={11} />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink)",
                }}
              >
                P1 · Due today, 12:00
              </span>
              <span style={{ width: 1, height: 12, background: "var(--hairline)" }} />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--accent)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "pulse 2s infinite",
                  }}
                />
                3 people waiting
              </span>
            </div>
            <h1
              style={{
                fontFamily: "var(--serif)",
                fontWeight: 400,
                fontSize: 44,
                lineHeight: 1.05,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {task.title}
            </h1>
          </header>

          <section
            style={{
              marginBottom: 32,
              paddingBottom: 28,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <SectionLabel label="Notes" small />
            <div
              style={{
                marginTop: 10,
                fontFamily: "var(--serif)",
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--ink)",
              }}
            >
              <p style={{ margin: "0 0 12px" }}>
                Decide between an async hand-off doc and a live walkthrough. Sasha and Wren are blocked until I
                commit one way.
              </p>
              <p
                style={{
                  margin: "0 0 12px",
                  color: "var(--muted)",
                  fontStyle: "italic",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Context: Sasha sent a Loom Friday arguing for async — easier to ref later. Wren prefers live so she
                can ask questions in flow. Both have valid points; the decision is mine.
              </p>
              <p style={{ margin: 0 }}>
                Tentative call:{" "}
                <span
                  style={{
                    background: "color-mix(in oklch, var(--accent) 16%, transparent)",
                    padding: "1px 4px",
                  }}
                >
                  do the live walkthrough but record it
                </span>
                , then post the recording + a 1-page decision tree in #onboarding-v2. Hybrid.
              </p>
            </div>
          </section>

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
                Subtasks · 1 of {subtasksExpanded.length} done
              </div>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                + subtask
              </button>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {subtasksExpanded.map((st, i) => (
                <li
                  key={st.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: i < subtasksExpanded.length - 1 ? "1px dotted var(--hairline)" : "none",
                    alignItems: "center",
                  }}
                >
                  <Checkbox checked={st.done} size={16} />
                  <span
                    style={{
                      fontSize: 15,
                      color: st.done ? "var(--muted)" : "var(--ink)",
                      textDecoration: st.done ? "line-through" : "none",
                    }}
                  >
                    {st.title}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                    {st.est || (st.done ? "done" : "")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <SectionLabel label="Linked Linear issue" small />
            <div
              style={{
                marginTop: 10,
                padding: "14px 18px",
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                background: "color-mix(in oklch, var(--ink) 2%, var(--paper))",
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
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SourceIcon source="linear" size={14} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}>LIN-2812</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "color-mix(in oklch, var(--accent) 12%, transparent)",
                      color: "var(--accent)",
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    In progress
                  </span>
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                  Updated 2h ago by Sasha
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 15,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                Onboarding v2 — hand-off mechanism for spec ownership transfer
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                Assignee: Mira · Cycle: 24 · Linked PR: <span style={{ color: "var(--ink)" }}>#1247</span> · 4 comments
              </div>
            </div>
          </section>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {showGemma && (
            <div
              style={{
                padding: "16px 18px",
                background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
                border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  marginBottom: 8,
                }}
              >
                ✦ Gemma's take
              </div>
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 14,
                  lineHeight: 1.5,
                  margin: 0,
                  color: "var(--ink)",
                }}
              >
                "Hybrid is the right call. Walkthrough takes 30 min and unblocks both. Schedule it for 11am — Wren
                is free and Sasha can join from her Tuesday block."
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 11, flex: 1 }}>Schedule at 11</button>
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          <div>
            <SectionLabel label="Properties" small />
            <ul
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 13,
              }}
            >
              {(
                [
                  {
                    k: "Project",
                    v: (
                      <>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#2d5a3d",
                            display: "inline-block",
                            marginRight: 6,
                          }}
                        />
                        Onboarding v2
                      </>
                    ),
                  },
                  { k: "Due", v: <span style={{ color: "var(--accent)" }}>Today · 12:00 (in 3h 14m)</span> },
                  {
                    k: "Priority",
                    v: (
                      <>
                        <PriorityMark p="P1" size={8} /> &nbsp; P1 · Blocking others
                      </>
                    ),
                  },
                  { k: "Estimate", v: "45 minutes" },
                  { k: "Created", v: "Mon, May 11 · 4:23pm" },
                  {
                    k: "Linked from",
                    v: (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <SourceIcon source="slack" size={11} color="var(--muted)" />
                        #growth thread
                      </span>
                    ),
                  },
                ] as { k: string; v: React.ReactNode }[]
              ).map((r) => (
                <li
                  key={r.k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                    }}
                  >
                    {r.k}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>{r.v}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionLabel label="People involved" small />
            <ul
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {[
                { i: "MA", n: "Mira (you)", r: "Owner", c: "var(--accent)" },
                { i: "SK", n: "Sasha Kim", r: "Waiting on you", c: "#2d5a3d" },
                { i: "WT", n: "Wren Takata", r: "Waiting on you", c: "#5a3da8" },
              ].map((p) => (
                <li
                  key={p.i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: p.c,
                      color: "var(--paper)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontFamily: "var(--ui)",
                      fontWeight: 500,
                    }}
                  >
                    {p.i}
                  </span>
                  <span style={{ fontSize: 13 }}>{p.n}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: p.r === "Owner" ? "var(--muted)" : "var(--accent)",
                    }}
                  >
                    {p.r}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionLabel label="History" small />
            <ul
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                position: "relative",
              }}
            >
              {(
                [
                  { who: "Mira", what: "added a subtask", when: "2h", marker: true },
                  { who: "Sasha", what: "commented in Linear", when: "4h" },
                  { who: "Gemma", what: "promoted to Today", when: "Mon 7am" },
                  { who: "Mira", what: "captured from #growth", when: "Mon" },
                ] as { who: string; what: string; when: string; marker?: boolean }[]
              ).map((a, i, arr) => (
                <li
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "12px 1fr auto",
                    gap: 10,
                    fontSize: 12,
                    lineHeight: 1.4,
                    position: "relative",
                  }}
                >
                  <span style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: a.marker ? "var(--accent)" : "var(--muted)",
                        marginTop: 4,
                      }}
                    />
                    {i < arr.length - 1 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 11,
                          bottom: -14,
                          width: 1,
                          background: "var(--hairline)",
                        }}
                      />
                    )}
                  </span>
                  <div>
                    <strong>{a.who}</strong> <span style={{ color: "var(--muted)" }}>{a.what}</span>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>{a.when}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </BriefingShell>
  );
}
