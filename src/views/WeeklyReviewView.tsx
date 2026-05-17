import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Project, Task } from "@shared/types";
import { deleteTask, patchTask as apiPatchTask } from "../api/tasks";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { SectionLabel } from "../components/briefing/SectionLabel";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { Checkbox } from "../components/Checkbox";
import { useCaptureModal } from "../stores/captureStore";
import { useEnsureProjectsLoaded, useProjectStore } from "../stores/projectStore";
import { useReviewStore } from "../stores/reviewStore";
import { useEnsureTasksLoaded, useTaskStore } from "../stores/taskStore";
import { useTweaks } from "../tweaks/TweaksProvider";

type Health = "on-track" | "blocked" | "tight" | "stale";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const TWO_WEEK_MS = 14 * DAY_MS;

const HEALTH_LABEL: Record<Health, { c: string; l: string }> = {
  "on-track": { c: "#2d7a4c", l: "On track" },
  blocked: { c: "var(--accent)", l: "Blocked" },
  tight: { c: "#b8843d", l: "Tight" },
  stale: { c: "var(--muted)", l: "Stale" },
};

const CHECKLIST_STEPS = [
  "Collect loose papers & receipts",
  "Process all inboxes to zero",
  "Review previous calendar",
  "Review upcoming calendar",
  "Review waiting-for list",
  "Review project list",
  "Review someday/maybe",
  "Be creative & courageous",
];

interface ProjectHealth {
  project: Project;
  health: Health;
  note: string;
}

function computeHealth(p: Project, tasks: Task[]): ProjectHealth {
  const own = tasks.filter((t) => t.projectId === p.id);
  const now = Date.now();
  const updatedTimes = own.map((t) => new Date(t.updatedAt).getTime());
  const lastTouched = updatedTimes.length > 0 ? Math.max(...updatedTimes) : new Date(p.updatedAt).getTime();
  const ageDays = Math.floor((now - lastTouched) / DAY_MS);

  const active = own.filter((t) => t.status === "today" || t.status === "next");
  const waiting = own.filter((t) => t.status === "waiting");
  const dueSoon = own.filter(
    (t) => t.due && new Date(t.due).getTime() <= now + WEEK_MS && t.status !== "done",
  );
  const doneCount = own.filter((t) => t.status === "done").length;

  let health: Health;
  let note: string;
  if (now - lastTouched >= TWO_WEEK_MS) {
    health = "stale";
    note = `Nothing done in ${ageDays} days`;
  } else if (dueSoon.length > 0) {
    health = "tight";
    note = `${dueSoon.length} due in the next week`;
  } else if (waiting.length > 0 && active.length === 0) {
    health = "blocked";
    note = `Waiting on ${waiting.length} item${waiting.length === 1 ? "" : "s"}`;
  } else {
    health = "on-track";
    note = `${doneCount}/${own.length} done`;
  }
  return { project: p, health, note };
}

export function WeeklyReviewView() {
  useEnsureTasksLoaded();
  useEnsureProjectsLoaded();
  const { tweaks } = useTweaks();
  const showGemma = tweaks.aiProminence !== "quiet";
  const loud = tweaks.aiProminence === "loud";

  const tasks = useTaskStore((s) => s.tasks);
  const taskStatus = useTaskStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);
  const projectStatus = useProjectStore((s) => s.status);
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);

  // Streaming AI review (recap + focus for next week). Only kick off the
  // generation once we have at least one task or project worth summarising
  // — saves a useless Ollama call for brand-new users.
  const reviewStatus = useReviewStore((s) => s.status);
  const reviewRecap = useReviewStore((s) => s.recap);
  const reviewFocus = useReviewStore((s) => s.focus);
  const reviewError = useReviewStore((s) => s.error);
  const regenerateReview = useReviewStore((s) => s.generate);

  const loaded = taskStatus === "ready" && projectStatus === "ready";
  const hasAnyData = tasks.length > 0 || projects.length > 0;

  // Fire the AI review once data has loaded AND there's something to summarise.
  useEffect(() => {
    if (loaded && hasAnyData && reviewStatus === "idle") {
      void regenerateReview();
    }
  }, [loaded, hasAnyData, reviewStatus, regenerateReview]);

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const wins = useMemo<Task[]>(() => {
    const weekAgo = Date.now() - WEEK_MS;
    return tasks
      .filter((t) => t.status === "done" && new Date(t.updatedAt).getTime() >= weekAgo)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tasks]);

  const stale = useMemo<Task[]>(() => {
    const cutoff = Date.now() - TWO_WEEK_MS;
    return tasks
      .filter(
        (t) =>
          (t.status === "next" || t.status === "waiting" || t.status === "someday") &&
          new Date(t.updatedAt).getTime() < cutoff,
      )
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }, [tasks]);

  const projectHealth = useMemo<ProjectHealth[]>(() => {
    return projects.map((p) => computeHealth(p, tasks));
  }, [projects, tasks]);

  const fullyEmpty = loaded && tasks.length === 0 && projects.length === 0;

  // Checklist state — UI-only, resets on reload.
  const [activeStep, setActiveStep] = useState(0);
  const checklist = CHECKLIST_STEPS.map((step, i) => ({
    step,
    done: i < activeStep,
    active: i === activeStep,
  }));

  async function patchStatus(t: Task, status: "today" | "someday") {
    const next = tasks.map((x) => (x.id === t.id ? { ...x, status } : x));
    useTaskStore.setState({ tasks: next });
    try {
      await apiPatchTask(t.id, { status });
    } catch (e) {
      console.error("patchStatus failed", e);
      useTaskStore.setState({ tasks });
    }
  }
  async function drop(t: Task) {
    const next = tasks.filter((x) => x.id !== t.id);
    useTaskStore.setState({ tasks: next });
    try {
      await deleteTask(t.id);
    } catch (e) {
      console.error("drop failed", e);
      useTaskStore.setState({ tasks });
    }
  }

  function relativeAge(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
    if (days < 1) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  return (
    <BriefingShell>
      <ViewHeader
        eyebrow={`Weekly review · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
        title={fullyEmpty ? "Your first weekly review." : "This week, in review."}
        actions={
          <>
            {loud && !fullyEmpty && (
              <button style={{ ...btnGhost, color: "var(--accent)", borderColor: "var(--accent)" }}>
                ✦ Ask Gemma
              </button>
            )}
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Step {activeStep + 1} of {CHECKLIST_STEPS.length}
            </span>
            <button
              style={btnGhost}
              onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
              disabled={activeStep === 0}
            >
              ← Back
            </button>
            <button
              style={btnPrimary}
              onClick={() => setActiveStep((s) => Math.min(CHECKLIST_STEPS.length - 1, s + 1))}
              disabled={activeStep === CHECKLIST_STEPS.length - 1}
            >
              Next step →
            </button>
          </>
        }
      />

      <div
        style={{
          padding: "24px 40px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 36,
        }}
      >
        <div>
          {!loaded ? (
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
          ) : fullyEmpty ? (
            <FirstRunGuide onCapture={() => setCaptureOpen(true)} />
          ) : (
            <>
              {showGemma && (
                <AiReviewBanner
                  status={reviewStatus}
                  recap={reviewRecap}
                  focus={reviewFocus}
                  error={reviewError}
                  onRegenerate={() => void regenerateReview()}
                />
              )}

              <section style={{ marginBottom: 32 }}>
                <SectionLabel label={`Wins this week · ${wins.length}`} />
                {wins.length === 0 ? (
                  <EmptyHint text="No wins yet — your first completed task will land here. Try checking one off in Today." />
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {wins.map((w, i) => {
                      const p = w.projectId ? projectsById.get(w.projectId) : null;
                      return (
                        <li
                          key={w.id}
                          data-row
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            gap: 12,
                            borderBottom: i < wins.length - 1 ? "1px solid var(--hairline)" : "none",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "#2d7a4c",
                              color: "var(--paper)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                            }}
                          >
                            ✓
                          </span>
                          <Link
                            to={`/task/${w.id}`}
                            style={{
                              fontFamily: "var(--serif)",
                              fontSize: 16,
                              lineHeight: 1.3,
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            {w.title}
                          </Link>
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 10,
                              color: "var(--muted)",
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                            }}
                          >
                            {p?.name || "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section style={{ marginBottom: 32 }}>
                <SectionLabel label={`Project health · ${projectHealth.length}`} />
                {projectHealth.length === 0 ? (
                  <EmptyHint text="No projects yet. Create one from the sidebar — it helps Gemma group your work." />
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {projectHealth.map(({ project: p, health, note }, i) => (
                      <li
                        key={p.id}
                        data-row
                        style={{
                          display: "grid",
                          gridTemplateColumns: "12px 1fr 110px auto",
                          gap: 14,
                          borderBottom: i < projectHealth.length - 1 ? "1px solid var(--hairline)" : "none",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                        <div>
                          <div style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.3 }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{note}</div>
                        </div>
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: HEALTH_LABEL[health].c,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: HEALTH_LABEL[health].c,
                            }}
                          />
                          {HEALTH_LABEL[health].l}
                        </span>
                        <Link
                          to={`/project/${p.id}`}
                          style={{
                            ...btnGhost,
                            padding: "5px 10px",
                            fontSize: 11,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          Review
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionLabel label={`Stale & needs decision · ${stale.length}`} />
                {stale.length === 0 ? (
                  <EmptyHint text="Nothing stale — everything in your lists has been touched in the last two weeks." />
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {stale.map((t, i) => {
                      const p = t.projectId ? projectsById.get(t.projectId) : null;
                      return (
                        <li
                          key={t.id}
                          data-row
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            gap: 12,
                            borderBottom: i < stale.length - 1 ? "1px solid var(--hairline)" : "none",
                            alignItems: "center",
                          }}
                        >
                          <Checkbox />
                          <div>
                            <Link
                              to={`/task/${t.id}`}
                              style={{ fontSize: 14, color: "var(--ink)", textDecoration: "none" }}
                            >
                              {t.title}
                            </Link>
                            <div
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: 10,
                                color: "var(--muted)",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                marginTop: 3,
                              }}
                            >
                              {(p?.name || t.status)} · last touched {relativeAge(t.updatedAt)}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}
                              onClick={() => void patchStatus(t, "today")}
                            >
                              Do this week
                            </button>
                            <button
                              style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}
                              onClick={() => void patchStatus(t, "someday")}
                            >
                              Defer
                            </button>
                            <button
                              style={{ ...btnGhost, padding: "5px 10px", fontSize: 11, color: "var(--muted)" }}
                              onClick={() => void drop(t)}
                            >
                              Drop
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <aside>
          <div style={{ position: "sticky", top: 0 }}>
            <SectionLabel label="Review steps" small />
            <ol
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderLeft: "1px solid var(--hairline)",
              }}
            >
              {checklist.map((c, i) => (
                <li
                  key={i}
                  onClick={() => setActiveStep(i)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 12,
                    padding: "10px 12px",
                    background: c.active ? "color-mix(in oklch, var(--accent) 8%, transparent)" : "transparent",
                    borderLeft: c.active ? "2px solid var(--accent)" : "2px solid transparent",
                    marginLeft: -1,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: c.done ? "var(--ink)" : "transparent",
                      border: c.done ? "none" : "1.5px solid var(--hairline)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--paper)",
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {c.done ? "✓" : i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: c.done ? "var(--muted)" : "var(--ink)",
                      textDecoration: c.done ? "line-through" : "none",
                      fontWeight: c.active ? 500 : 400,
                    }}
                  >
                    {c.step}
                  </span>
                </li>
              ))}
            </ol>

            <div
              style={{
                marginTop: 24,
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
                This week's mind sweep
              </div>
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 13,
                  lineHeight: 1.45,
                  margin: 0,
                  color: "var(--ink)",
                }}
              >
                What hasn't made it into the system? Quick capture below.
              </p>
              <button
                onClick={() => setCaptureOpen(true)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "8px 0",
                  background: "var(--ink)",
                  color: "var(--paper)",
                  border: "none",
                  borderRadius: 3,
                  fontFamily: "var(--ui)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ⌘K · Mind sweep
              </button>
            </div>
          </div>
        </aside>
      </div>
    </BriefingShell>
  );
}

interface BannerProps {
  status: "idle" | "streaming" | "ready" | "error";
  recap: string;
  focus: string;
  error: string | null;
  onRegenerate: () => void;
}

function weekEndingLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMarkdown(recap: string, focus: string): string {
  const heading = `# Weekly review — ${weekEndingLabel()}`;
  const parts = [heading];
  if (recap) parts.push(`## Recap\n\n${recap}`);
  if (focus) parts.push(`## Focus for next week\n\n${focus}`);
  return parts.join("\n\n") + "\n";
}

function AiReviewBanner({ status, recap, focus, error, onRegenerate }: BannerProps) {
  const streaming = status === "streaming";
  const errored = status === "error";
  const idle = status === "idle";

  // Don't render an empty placeholder card before the first generation kicks off.
  if (idle && !recap && !focus) return null;

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const canCopy = !streaming && (recap.length > 0 || focus.length > 0);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown(recap, focus));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch (e) {
      console.error("Clipboard copy failed:", e);
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  };

  return (
    <section
      style={{
        padding: "22px 26px",
        background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
        border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
        borderRadius: 4,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 12,
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
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: errored ? "var(--muted)" : "var(--accent)",
              animation: streaming ? "pulse 1.4s infinite" : "none",
              flexShrink: 0,
            }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {errored
              ? "Gemma offline"
              : streaming
                ? "Drafting your weekly review…"
                : `Week ending ${weekEndingLabel()}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onCopy}
            disabled={!canCopy}
            style={{
              background: copyState === "copied" ? "var(--accent)" : "transparent",
              border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
              color: copyState === "copied" ? "var(--paper)" : "var(--accent)",
              padding: "4px 10px",
              borderRadius: 3,
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: canCopy ? "pointer" : "default",
              opacity: canCopy ? 1 : 0.4,
              transition: "background 120ms ease-out",
            }}
            title="Copy as Markdown — paste into your status update or write-up."
          >
            {copyState === "copied"
              ? "✓ Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy as Markdown"}
          </button>
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
      </div>

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 4,
        }}
      >
        Recap
      </div>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 17,
          lineHeight: 1.5,
          margin: "0 0 18px",
          color: "var(--ink)",
          minHeight: 24,
        }}
      >
        {recap || (streaming ? "" : errored ? error || "Could not reach Gemma." : "")}
      </p>

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 4,
        }}
      >
        Focus for next week
      </div>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 17,
          lineHeight: 1.5,
          margin: 0,
          color: "var(--ink)",
          minHeight: 24,
        }}
      >
        {focus || (streaming ? "" : "")}
      </p>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--serif)",
        fontStyle: "italic",
        color: "var(--muted)",
        fontSize: 14,
        padding: "10px 0",
      }}
    >
      {text}
    </div>
  );
}

function FirstRunGuide({ onCapture }: { onCapture: () => void }) {
  return (
    <div>
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 19,
          lineHeight: 1.5,
          color: "var(--ink)",
          margin: "0 0 28px",
          maxWidth: 560,
        }}
      >
        Friday is the day to step back. There's nothing here yet — and that's expected. Here's the
        order of play once you've got some work in the system.
      </p>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          maxWidth: 620,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        {[
          {
            n: 1,
            title: "Capture what's on your mind",
            body: "Press ⌘K anywhere to dump a thought into the inbox. Don't think — just write.",
          },
          {
            n: 2,
            title: "Process inbox to zero",
            body: "Open Inbox and decide for each item: do it, defer it, delegate it, drop it. Two minutes or less → do it now.",
          },
          {
            n: 3,
            title: "Plan your Today",
            body: "Pull the 3–5 things that have to move today into the Today list. Everything else can wait.",
          },
          {
            n: 4,
            title: "Come back here on Friday",
            body: "Once you have tasks and projects, this view will show your wins, project health, stale items, and a Gemma readout — all live.",
          },
        ].map((s) => (
          <li
            key={s.n}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 18,
              padding: "18px 0",
              borderBottom: "1px solid var(--hairline)",
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "1.5px solid var(--ink)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink)",
                flexShrink: 0,
              }}
            >
              {s.n}
            </span>
            <div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 19, lineHeight: 1.3, marginBottom: 4 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        <button style={btnPrimary} onClick={onCapture}>
          Capture your first thought
        </button>
        <Link to="/" style={{ ...btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Back to Today
        </Link>
      </div>
    </div>
  );
}
