import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Release } from "@shared/types";
import {
  fetchChangelog,
  fetchRelease,
  type ReleaseDetail,
  type ReleaseDetailTask,
} from "../api/releases";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { SectionLabel } from "../components/briefing/SectionLabel";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { DatePicker } from "../components/DatePicker";
import { PriorityMark } from "../components/PriorityMark";
import {
  useEnsureProjectsLoaded,
  useProjectStore,
} from "../stores/projectStore";
import { useReleaseStore } from "../stores/releaseStore";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ReleaseDetailView() {
  useEnsureProjectsLoaded();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const updateRelease = useReleaseStore((s) => s.updateRelease);
  const deleteRelease = useReleaseStore((s) => s.deleteRelease);
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setStatus("loading");
    void (async () => {
      try {
        const data = await fetchRelease(id);
        if (cancelled) return;
        setDetail(data);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setStatus("missing");
        } else {
          setStatus("error");
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "loading") {
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
          Loading release…
        </div>
      </BriefingShell>
    );
  }
  if (status === "missing") {
    return (
      <BriefingShell>
        <NotFound onBack={() => navigate(-1)} />
      </BriefingShell>
    );
  }
  if (status === "error" || !detail) {
    return (
      <BriefingShell>
        <div
          style={{
            padding: 40,
            fontFamily: "var(--ui)",
            fontSize: 14,
            color: "var(--accent)",
          }}
        >
          Couldn't load release — {error}
        </div>
      </BriefingShell>
    );
  }

  const parentProject = projects.find((p) => p.id === detail.release.projectId) ?? null;

  return (
    <Detail
      detail={detail}
      projectName={parentProject?.name ?? null}
      onPatch={async (input) => {
        await updateRelease(detail.release.id, input);
        // Optimistic local update — refetch to pick up server-confirmed state.
        try {
          const fresh = await fetchRelease(detail.release.id);
          setDetail(fresh);
        } catch {
          /* keep optimistic */
        }
      }}
      onDelete={async () => {
        if (!confirm(`Delete release ${detail.release.version}? Tasks tagged to it will be unassigned.`)) return;
        await deleteRelease(detail.release.id);
        navigate(`/project/${detail.release.projectId}`);
      }}
      onBackToProject={() => navigate(`/project/${detail.release.projectId}`)}
    />
  );
}

interface DetailProps {
  detail: ReleaseDetail;
  projectName: string | null;
  onPatch: (input: {
    version?: string;
    name?: string | null;
    notes?: string;
    releasedAt?: string | null;
    customers?: string[];
    checklistItems?: string[];
    checklistCompleted?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onBackToProject: () => void;
}

function Detail({ detail, projectName, onPatch, onDelete, onBackToProject }: DetailProps) {
  const { release, tasks, movedOut } = detail;

  // Quality rollups — bugs / regressions / features in this release.
  const bugCount = tasks.filter((t) => t.kind === "bug").length;
  const regressionCount = tasks.filter((t) => t.kind === "bug" && t.isRegression).length;
  const featureCount = tasks.filter((t) => t.kind === "feature").length;
  const choreCount = tasks.filter((t) => t.kind === "chore").length;

  // Checklist — the items and what's been ticked off both live on the
  // release row, so each release can have its own definition-of-done.
  const checklistItems = release.checklistItems;
  const checklistDone = new Set(release.checklistCompleted);
  const checklistCompletedCount = checklistItems.filter((i) => checklistDone.has(i)).length;
  const checklistRemaining = checklistItems.length - checklistCompletedCount;
  const checklistBlocksRelease = checklistItems.length > 0 && checklistRemaining > 0;

  const toggleChecklist = (item: string) => {
    const next = new Set(checklistDone);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    void onPatch({ checklistCompleted: [...next] });
  };
  const addChecklistItem = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || checklistItems.includes(trimmed)) return;
    void onPatch({ checklistItems: [...checklistItems, trimmed] });
  };
  const removeChecklistItem = (item: string) => {
    void onPatch({
      checklistItems: checklistItems.filter((i) => i !== item),
      // Also drop the completion flag so we don't leak orphans.
      checklistCompleted: release.checklistCompleted.filter((i) => i !== item),
    });
  };

  // Inline editors for the big fields.
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(release.name ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingName) {
      setDraftName(release.name ?? "");
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [editingName, release.name]);

  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(release.notes);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingNotes) {
      setDraftNotes(release.notes);
      window.requestAnimationFrame(() => notesRef.current?.focus());
    }
  }, [editingNotes, release.notes]);

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const onCopyChangelog = async () => {
    try {
      const { markdown } = await fetchChangelog(release.id);
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch (e) {
      console.error(e);
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  };

  const released = !!release.releasedAt;

  const commitName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== release.name) void onPatch({ name: next });
  };
  const commitNotes = () => {
    setEditingNotes(false);
    if (draftNotes !== release.notes) void onPatch({ notes: draftNotes });
  };

  const toggleReleased = () => {
    if (released) {
      if (!confirm("Mark this release as planned again?")) return;
      void onPatch({ releasedAt: null });
      return;
    }
    if (checklistBlocksRelease) {
      alert(
        `Can't mark released — ${checklistRemaining} checklist item${checklistRemaining === 1 ? "" : "s"} still pending.`,
      );
      return;
    }
    void onPatch({ releasedAt: new Date().toISOString() });
  };

  const setReleaseDate = (iso: string | null) => {
    void onPatch({ releasedAt: iso });
  };

  // Customer-tag editor
  const [customerDraft, setCustomerDraft] = useState("");
  const addCustomer = () => {
    const v = customerDraft.trim();
    if (!v) return;
    if (release.customers.includes(v)) {
      setCustomerDraft("");
      return;
    }
    void onPatch({ customers: [...release.customers, v] });
    setCustomerDraft("");
  };
  const removeCustomer = (name: string) => {
    void onPatch({ customers: release.customers.filter((c) => c !== name) });
  };

  return (
    <BriefingShell activeOverride={projectName ?? undefined}>
      <ViewHeader
        eyebrow={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onBackToProject}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
              }}
            >
              {projectName ?? "Project"}
            </button>
            <span>›</span>
            <span style={{ color: "var(--ink)" }}>Release {release.version}</span>
          </span>
        }
        title={
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontFamily: "var(--mono)" }}>{release.version}</span>
            {editingName ? (
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
                placeholder="codename"
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 32,
                  color: "var(--muted)",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--accent)",
                  outline: "none",
                  padding: 0,
                  minWidth: 220,
                }}
              />
            ) : (
              <em
                onClick={() => setEditingName(true)}
                style={{
                  fontStyle: "italic",
                  color: "var(--muted)",
                  cursor: "text",
                  fontSize: 32,
                }}
                title="Click to edit codename"
              >
                {release.name ?? "click to add codename"}
              </em>
            )}
          </span>
        }
        actions={
          <>
            <button onClick={onBackToProject} style={btnGhost}>
              ← Back
            </button>
            <button
              type="button"
              onClick={onCopyChangelog}
              style={{
                ...btnGhost,
                background: copyState === "copied" ? "var(--accent)" : "transparent",
                color: copyState === "copied" ? "var(--paper)" : "var(--accent)",
                borderColor: "var(--accent)",
              }}
            >
              {copyState === "copied"
                ? "✓ Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy changelog"}
            </button>
            <button
              onClick={toggleReleased}
              disabled={!released && checklistBlocksRelease}
              title={
                !released && checklistBlocksRelease
                  ? `Complete the ${checklistRemaining} remaining checklist item${checklistRemaining === 1 ? "" : "s"} before marking released.`
                  : undefined
              }
              style={{
                ...btnPrimary,
                opacity: !released && checklistBlocksRelease ? 0.4 : 1,
                cursor: !released && checklistBlocksRelease ? "not-allowed" : "pointer",
              }}
            >
              {released
                ? "Mark planned"
                : checklistBlocksRelease
                  ? `Mark released (${checklistRemaining} pending)`
                  : "Mark released today"}
            </button>
            <button onClick={() => void onDelete()} style={{ ...btnGhost, color: "var(--muted)" }}>
              Delete
            </button>
          </>
        }
      />

      <div
        style={{
          padding: "24px 40px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 36,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: released ? "#2d7a4c" : "var(--accent)",
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: released ? "#2d7a4c" : "var(--accent)",
                display: "inline-block",
                marginRight: 8,
              }}
            />
            {released
              ? `Released on ${formatDate(release.releasedAt!)}`
              : "Planned — not yet released"}
          </div>

          {/* Description / notes */}
          <section
            style={{
              marginBottom: 32,
              paddingBottom: 28,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <SectionLabel label="Description" small />
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
                placeholder="What's in this release? Use this for the narrative you'd send to customers."
                rows={5}
                style={{
                  width: "100%",
                  marginTop: 10,
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 15,
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
                  fontStyle: "italic",
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: release.notes ? "var(--ink)" : "var(--muted)",
                  cursor: "text",
                  whiteSpace: "pre-wrap",
                  minHeight: 28,
                }}
              >
                {release.notes ||
                  "Click to add a description — the narrative customers will see in the changelog."}
              </div>
            )}
          </section>

          {/* In this release */}
          <section style={{ marginBottom: 32 }}>
            <SectionLabel
              label={`In this release · ${tasks.length} item${tasks.length === 1 ? "" : "s"}`}
              small
            />
            {tasks.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--muted)",
                  fontSize: 14,
                  marginTop: 10,
                }}
              >
                No tasks tagged yet. Open a task and pick this release in the sidebar.
              </p>
            ) : (
              <TaskList tasks={tasks} />
            )}
          </section>

          {/* Moved out — issues originally planned here but moved elsewhere */}
          {movedOut.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <SectionLabel
                label={`Originally planned here · moved to a later release · ${movedOut.length}`}
                small
              />
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--muted)",
                  fontSize: 13,
                  marginTop: 8,
                  marginBottom: 10,
                }}
              >
                These issues were intended for this release but were pushed out — they may have
                shipped in a later version.
              </p>
              <TaskList tasks={movedOut} showCurrentRelease />
            </section>
          )}

          {/* Regressions reported against this release — bugs filed later
              whose `regressionOfReleaseId` points back at it. */}
          {detail.regressions.length > 0 && (
            <section>
              <SectionLabel
                label={`Regressions reported against this release · ${detail.regressions.length}`}
                small
              />
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--muted)",
                  fontSize: 13,
                  marginTop: 8,
                  marginBottom: 10,
                }}
              >
                Bugs filed later that broke something this release shipped. The fix may live in a
                later version — click through to see where each bug lives now.
              </p>
              <TaskList tasks={detail.regressions} showCurrentRelease />
            </section>
          )}
        </div>

        {/* Right column — summaries + metadata */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {/* Quality summary — features / bugs / regressions / chores. */}
          <div>
            <SectionLabel label="Summary" small />
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
              }}
            >
              <Stat label="Features" value={featureCount} />
              <Stat label="Bugs" value={bugCount} accent={bugCount > 0 ? "var(--accent)" : undefined} />
              <Stat
                label="Regressions"
                value={regressionCount}
                accent={regressionCount > 0 ? "var(--accent)" : undefined}
              />
              <Stat label="Chores" value={choreCount} />
            </div>
          </div>

          {/* Definition-of-done checklist — items must all be ticked before
              "Mark released" is allowed (server enforces too). */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <SectionLabel label="Release checklist" small />
              {checklistItems.length > 0 && (
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color:
                      checklistCompletedCount === checklistItems.length
                        ? "#2d7a4c"
                        : "var(--muted)",
                  }}
                >
                  {checklistCompletedCount}/{checklistItems.length}
                </span>
              )}
            </div>
            {checklistItems.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--muted)",
                  fontSize: 12,
                  lineHeight: 1.45,
                  margin: "0 0 10px",
                }}
              >
                Add items every release should satisfy before shipping —{" "}
                <em>"QA signed off"</em>, <em>"Docs updated"</em>.
              </p>
            ) : (
              <ul
                style={{
                  margin: "0 0 10px",
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {checklistItems.map((item) => {
                  const done = checklistDone.has(item);
                  return (
                    <li
                      key={item}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleChecklist(item)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 6px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "var(--ui)",
                          fontSize: 13,
                          color: done ? "var(--muted)" : "var(--ink)",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            border: done ? "none" : "1.5px solid var(--hairline)",
                            background: done ? "#2d7a4c" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--paper)",
                            fontFamily: "var(--mono)",
                            fontSize: 9,
                            flexShrink: 0,
                          }}
                        >
                          {done ? "✓" : ""}
                        </span>
                        <span
                          style={{
                            textDecoration: done ? "line-through" : "none",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(item)}
                        aria-label={`Remove ${item}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 14,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <ChecklistAddRow onAdd={addChecklistItem} />
          </div>

          <div>
            <SectionLabel label="Release date" small />
            <div style={{ marginTop: 10 }}>
              <DatePicker
                value={release.releasedAt}
                onChange={(iso) => setReleaseDate(iso)}
              />
            </div>
          </div>

          <div>
            <SectionLabel label="Customers · optional" small />
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {release.customers.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {release.customers.map((c) => (
                    <span
                      key={c}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        background: "color-mix(in oklch, var(--accent) 8%, var(--paper))",
                        border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
                        borderRadius: 3,
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        color: "var(--ink)",
                      }}
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeCustomer(c)}
                        aria-label={`Remove ${c}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          padding: 0,
                          lineHeight: 1,
                          fontSize: 12,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={customerDraft}
                  onChange={(e) => setCustomerDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomer();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setCustomerDraft("");
                    }
                  }}
                  placeholder="Add a customer name"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "6px 8px",
                    border: "1px solid var(--hairline)",
                    borderRadius: 3,
                    background: "transparent",
                    color: "var(--ink)",
                    fontFamily: "var(--ui)",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomer}
                  disabled={!customerDraft.trim()}
                  style={{
                    ...btnGhost,
                    padding: "5px 10px",
                    fontSize: 11,
                    opacity: customerDraft.trim() ? 1 : 0.4,
                    cursor: customerDraft.trim() ? "pointer" : "default",
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>

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
              <li>Created · {new Date(release.createdAt).toLocaleString()}</li>
              <li>Updated · {new Date(release.updatedAt).toLocaleString()}</li>
            </ul>
          </div>
        </aside>
      </div>
    </BriefingShell>
  );
}

function TaskList({
  tasks,
  showCurrentRelease,
}: {
  tasks: ReleaseDetailTask[];
  showCurrentRelease?: boolean;
}) {
  // For "moved out" tasks, render where they ended up.
  const releasesByProject = useReleaseStore((s) => s.byProject);
  // Flatten all releases the user has loaded into an id-keyed map for label lookup.
  const releaseLabelById = useMemo(() => {
    const m = new Map<string, Release>();
    for (const list of releasesByProject.values()) {
      for (const r of list) m.set(r.id, r);
    }
    return m;
  }, [releasesByProject]);

  return (
    <ul
      style={{
        margin: "12px 0 0",
        padding: 0,
        listStyle: "none",
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {tasks.map((t, i) => {
        const currentReleaseLabel =
          showCurrentRelease && t.releaseId ? releaseLabelById.get(t.releaseId) : null;
        return (
          <li
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 12,
              padding: "10px 14px",
              borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
              alignItems: "center",
              background: "var(--paper)",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: t.status === "done" ? "#2d7a4c" : "transparent",
                border: t.status === "done" ? "none" : "1.5px solid var(--hairline)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--paper)",
                fontSize: 9,
                fontFamily: "var(--mono)",
              }}
            >
              {t.status === "done" ? "✓" : ""}
            </span>
            <Link
              to={`/task/${t.id}`}
              style={{ textDecoration: "none", color: "var(--ink)", minWidth: 0 }}
            >
              <div style={{ fontSize: 14, lineHeight: 1.3 }}>
                {t.clientDescription.trim() || t.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--muted)",
                  marginTop: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <PriorityMark p={t.priority as "P1" | "P2" | "P3" | "P4"} size={6} />
                {t.priority}
                <span>·</span>
                <span>{t.status}</span>
                {showCurrentRelease && (
                  <>
                    <span>·</span>
                    <span>
                      now in{" "}
                      {currentReleaseLabel ? (
                        <Link
                          to={`/release/${currentReleaseLabel.id}`}
                          style={{
                            color: "var(--accent)",
                            textDecoration: "none",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {currentReleaseLabel.version}
                          {currentReleaseLabel.name ? ` · ${currentReleaseLabel.name}` : ""}
                        </Link>
                      ) : (
                        <em>(no release)</em>
                      )}
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
                textAlign: "right",
              }}
            >
              {t.dueText ?? ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 28,
          lineHeight: 1,
          color: accent ?? "var(--ink)",
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ChecklistAddRow({ onAdd }: { onAdd: (item: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft("");
          }
        }}
        placeholder="Add a checklist item — e.g. QA signed off"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "6px 10px",
          border: "1px solid var(--hairline)",
          borderRadius: 3,
          background: "transparent",
          color: "var(--ink)",
          fontFamily: "var(--ui)",
          fontSize: 13,
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!draft.trim()}
        style={{
          background: "transparent",
          border: "1px dashed var(--hairline)",
          color: "var(--muted)",
          padding: "6px 12px",
          borderRadius: 3,
          cursor: draft.trim() ? "pointer" : "default",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          opacity: draft.trim() ? 1 : 0.4,
        }}
      >
        Add
      </button>
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
        Release not found.
      </h1>
      <button onClick={onBack} style={btnPrimary}>
        Back
      </button>
    </div>
  );
}
