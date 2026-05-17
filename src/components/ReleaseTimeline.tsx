import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Release, Task } from "@shared/types";
import { fetchChangelog } from "../api/releases";
import {
  EMPTY_RELEASES,
  useEnsureReleasesLoaded,
  useReleaseStore,
} from "../stores/releaseStore";
import { useEnsureProjectTasksLoaded, useTaskStore } from "../stores/taskStore";
import { btnGhost, btnPrimary } from "./briefing/buttons";
import { SectionLabel } from "./briefing/SectionLabel";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

interface Props {
  projectId: string;
}

export function ReleaseTimeline({ projectId }: Props) {
  useEnsureReleasesLoaded(projectId);
  // Release timeline shares the project's task slice — ProjectView already
  // ensured this on mount, but call here so the component is self-contained
  // (the loader is idempotent / dedup'd by slice key).
  useEnsureProjectTasksLoaded(projectId);

  const releases =
    useReleaseStore((s) => s.byProject.get(projectId)) ?? EMPTY_RELEASES;
  const loadStatus = useReleaseStore((s) => s.loaded.get(projectId));
  const tasks = useTaskStore((s) => s.tasks);
  const updateRelease = useReleaseStore((s) => s.updateRelease);
  const deleteRelease = useReleaseStore((s) => s.deleteRelease);

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tasksByRelease = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.releaseId) continue;
      const arr = m.get(t.releaseId) ?? [];
      arr.push(t);
      m.set(t.releaseId, arr);
    }
    return m;
  }, [tasks]);

  const expanded = expandedId
    ? releases.find((r) => r.id === expandedId) ?? null
    : null;

  return (
    <section style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <SectionLabel label="Releases" />
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            background: "transparent",
            border: "1px dashed var(--hairline)",
            color: "var(--muted)",
            padding: "4px 10px",
            borderRadius: 3,
            cursor: "pointer",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          + Release
        </button>
      </div>

      {loadStatus === "loading" && releases.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "12px 0",
          }}
        >
          Loading releases…
        </div>
      ) : releases.length === 0 ? (
        <EmptyTimeline onCreate={() => setCreateOpen(true)} />
      ) : (
        <TimelineStrip
          releases={releases}
          tasksByRelease={tasksByRelease}
          expandedId={expandedId}
          onSelect={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        />
      )}

      {expanded && (
        <ReleaseCard
          release={expanded}
          tasks={tasksByRelease.get(expanded.id) ?? []}
          onUpdate={(input) => updateRelease(expanded.id, input)}
          onDelete={async () => {
            if (!confirm(`Delete release ${expanded.version}? Tasks will be unassigned.`)) return;
            await deleteRelease(expanded.id);
            setExpandedId(null);
          }}
        />
      )}

      {createOpen && (
        <CreateReleaseModal
          projectId={projectId}
          existingVersions={releases.map((r) => r.version)}
          onClose={(createdId) => {
            setCreateOpen(false);
            if (createdId) setExpandedId(createdId);
          }}
        />
      )}
    </section>
  );
}

function EmptyTimeline({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        padding: "20px 18px",
        border: "1px dashed var(--hairline)",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--muted)",
          fontSize: 14,
          margin: 0,
          maxWidth: 520,
        }}
      >
        No releases yet. Create one and tag tasks to it — when you ship, copy a clean
        markdown changelog ready for your release notes.
      </p>
      <button type="button" onClick={onCreate} style={btnPrimary}>
        + First release
      </button>
    </div>
  );
}

interface StripProps {
  releases: Release[];
  tasksByRelease: Map<string, Task[]>;
  expandedId: string | null;
  onSelect: (id: string) => void;
}

function TimelineStrip({ releases, tasksByRelease, expandedId, onSelect }: StripProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        overflowX: "auto",
        padding: "8px 4px 14px",
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        position: "relative",
      }}
    >
      {releases.map((r, i) => {
        const tasks = tasksByRelease.get(r.id) ?? [];
        const done = tasks.filter((t) => t.status === "done").length;
        const released = !!r.releasedAt;
        const inProgress = !released && done > 0;
        const dotColor = released
          ? "#2d7a4c"
          : inProgress
            ? "var(--accent)"
            : "var(--muted)";
        const active = r.id === expandedId;

        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            style={{
              flex: "0 0 auto",
              minWidth: 130,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "10px 14px",
              border: "none",
              borderRight:
                i < releases.length - 1 ? "1px solid var(--hairline)" : "none",
              background: active
                ? "color-mix(in oklch, var(--accent) 6%, var(--paper))"
                : "transparent",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
            }}
            aria-pressed={active}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dotColor,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                  color: "var(--ink)",
                }}
              >
                {r.version}
              </span>
            </div>
            {r.name && (
              <span
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "var(--ink)",
                  lineHeight: 1.2,
                  marginBottom: 4,
                }}
              >
                {r.name}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: dotColor,
              }}
            >
              {released
                ? `Released ${formatDate(r.releasedAt!)}`
                : inProgress
                  ? `In progress · ${done}/${tasks.length}`
                  : "Planned"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface CardProps {
  release: Release;
  tasks: Task[];
  onUpdate: (input: {
    version?: string;
    name?: string | null;
    notes?: string;
    releasedAt?: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ReleaseCard({ release, tasks, onUpdate, onDelete }: CardProps) {
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
  const onCopyMarkdown = async () => {
    try {
      const { markdown } = await fetchChangelog(release.id);
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch (e) {
      console.error("Copy changelog failed:", e);
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  };

  const released = !!release.releasedAt;
  const totalDone = tasks.filter((t) => t.status === "done").length;

  const toggleReleased = async () => {
    if (released) {
      if (!confirm(`Mark ${release.version} as planned again?`)) return;
      await onUpdate({ releasedAt: null });
    } else {
      await onUpdate({ releasedAt: new Date().toISOString() });
    }
  };

  const commitNotes = async () => {
    setEditingNotes(false);
    if (draftNotes !== release.notes) {
      await onUpdate({ notes: draftNotes });
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: "20px 22px",
        background: "var(--paper)",
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: released ? "#2d7a4c" : "var(--accent)",
              marginBottom: 4,
            }}
          >
            {released ? `Released ${formatDate(release.releasedAt!)}` : "Planned"}
          </div>
          <h3
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 400,
              fontSize: 26,
              lineHeight: 1.1,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {release.version}
            {release.name && (
              <em style={{ fontStyle: "italic", color: "var(--muted)" }}> · {release.name}</em>
            )}
          </h3>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onCopyMarkdown}
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
              cursor: "pointer",
              transition: "background 120ms ease-out",
            }}
            title="Copy changelog markdown to clipboard."
          >
            {copyState === "copied"
              ? "✓ Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy changelog"}
          </button>
          <button type="button" onClick={toggleReleased} style={btnGhost}>
            {released ? "Mark planned" : "Mark released"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{ ...btnGhost, color: "var(--muted)" }}
          >
            Delete
          </button>
        </div>
      </div>

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
              void commitNotes();
            }
          }}
          placeholder="Narrative notes — context, theme, anything worth saying about this release."
          rows={3}
          style={{
            width: "100%",
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.55,
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
          onClick={() => setEditingNotes(true)}
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.55,
            color: release.notes ? "var(--ink)" : "var(--muted)",
            margin: "0 0 16px",
            cursor: "text",
            whiteSpace: "pre-wrap",
            minHeight: 24,
          }}
        >
          {release.notes || "Click to add narrative notes — theme, callouts, anything worth saying."}
        </p>
      )}

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Items in this release · {totalDone}/{tasks.length} done
      </div>
      {tasks.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            color: "var(--muted)",
            fontSize: 13,
            margin: 0,
          }}
        >
          No tasks tagged yet. Open a task and pick this release in the right column.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {tasks.map((t) => (
            <li
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px dotted var(--hairline)",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: t.status === "done" ? "#2d7a4c" : "transparent",
                  border:
                    t.status === "done" ? "none" : "1.5px solid var(--hairline)",
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
                style={{
                  textDecoration: "none",
                  color: "var(--ink)",
                  display: "block",
                }}
              >
                <div style={{ fontSize: 14, lineHeight: 1.3 }}>
                  {t.clientDescription.trim() || t.title}
                </div>
                {t.clientDescription.trim() && (
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "var(--muted)",
                      letterSpacing: "0.04em",
                      marginTop: 2,
                    }}
                  >
                    Internal: {t.title}
                  </div>
                )}
              </Link>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                {t.priority}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CreateModalProps {
  projectId: string;
  existingVersions: string[];
  onClose: (createdId?: string) => void;
}

function CreateReleaseModal({ projectId, existingVersions, onClose }: CreateModalProps) {
  const create = useReleaseStore((s) => s.createRelease);
  const [version, setVersion] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [released, setReleased] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = version.trim();
    if (!SEMVER_RE.test(v)) {
      setValidationError("Use MAJOR.MINOR.PATCH (e.g. 0.1.0)");
      return;
    }
    if (existingVersions.includes(v)) {
      setValidationError(`${v} already exists in this project.`);
      return;
    }
    setSaving(true);
    const created = await create(projectId, {
      version: v,
      name: name.trim() || undefined,
      notes: notes.trim() || undefined,
      releasedAt: released ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (created) onClose(created.id);
  };

  return (
    <div
      onClick={() => onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "color-mix(in oklch, var(--ink) 35%, transparent)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "16vh 24px 24px",
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--paper)",
          borderRadius: 6,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
          fontFamily: "var(--ui)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span>New release</span>
          <span>esc cancel · ⏎ create</span>
        </div>

        <div>
          <label
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Version (MAJOR.MINOR.PATCH)
          </label>
          <input
            ref={inputRef}
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            disabled={saving}
            placeholder="0.1.0"
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: 18,
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              borderBottom: validationError
                ? "1px solid var(--accent)"
                : "1px solid var(--ink)",
              outline: "none",
              padding: "4px 0 8px",
            }}
          />
          {validationError && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--accent)",
              }}
            >
              {validationError}
            </div>
          )}
        </div>

        <div>
          <label
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Codename (optional)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            placeholder="e.g. first stab"
            style={{
              width: "100%",
              fontFamily: "var(--serif)",
              fontSize: 16,
              color: "var(--ink)",
              background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              outline: "none",
              padding: "8px 10px",
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            placeholder="Theme, callouts, anything worth saying. Appears in the changelog."
            rows={3}
            style={{
              width: "100%",
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 14,
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
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--ui)",
            fontSize: 13,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={released}
            onChange={(e) => setReleased(e.target.checked)}
          />
          Mark as released today
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => onClose()}
            disabled={saving}
            style={btnGhost}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !version.trim()}
            style={{
              ...btnPrimary,
              opacity: saving || !version.trim() ? 0.5 : 1,
              cursor: saving || !version.trim() ? "default" : "pointer",
            }}
          >
            {saving ? "Creating…" : "Create release"}
          </button>
        </div>
      </form>
    </div>
  );
}
