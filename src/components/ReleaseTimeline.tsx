import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Release, Task } from "@shared/types";
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

  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [versionFilter, setVersionFilter] = useState("");

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

  // Two grouped sections in the sidebar:
  //   • Upcoming      — unreleased (newest first), capped at 5
  //   • Recently released — released (newest first), capped at 5
  // When the user types in the search box, both caps lift and the matching
  // results stream through (capped at 25 to keep the column tidy).
  const MAX_PER_GROUP = 5;
  const newestFirst = useMemo(() => [...releases].reverse(), [releases]);
  const upcomingAll = useMemo(
    () => newestFirst.filter((r) => !r.releasedAt),
    [newestFirst],
  );
  const releasedAll = useMemo(
    () =>
      newestFirst
        .filter((r) => !!r.releasedAt)
        // Re-sort by released_at desc — semver order may not match shipping order.
        .sort((a, b) => new Date(b.releasedAt!).getTime() - new Date(a.releasedAt!).getTime()),
    [newestFirst],
  );

  const filterQ = versionFilter.trim().toLowerCase();
  const matchFilter = (r: Release) =>
    !filterQ ||
    r.version.toLowerCase().includes(filterQ) ||
    (r.name?.toLowerCase().includes(filterQ) ?? false);

  const upcomingVisible = upcomingAll.filter(matchFilter).slice(0, filterQ ? 25 : MAX_PER_GROUP);
  const releasedVisible = releasedAll.filter(matchFilter).slice(0, filterQ ? 25 : MAX_PER_GROUP);
  const upcomingHidden = upcomingAll.filter(matchFilter).length - upcomingVisible.length;
  const releasedHidden = releasedAll.filter(matchFilter).length - releasedVisible.length;

  return (
    <section style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SectionLabel label="Releases" />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              background: "transparent",
              border: "1px dashed var(--hairline)",
              color: "var(--muted)",
              padding: "3px 8px",
              borderRadius: 3,
              cursor: "pointer",
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            + New
          </button>
        </div>
        {releases.length > MAX_PER_GROUP && (
          <input
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
            placeholder={`Find in ${releases.length}…`}
            style={{
              width: "100%",
              padding: "4px 8px",
              background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: 3,
              color: "var(--ink)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        )}
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
      ) : upcomingVisible.length === 0 && releasedVisible.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--muted)",
            margin: "8px 0 0",
          }}
        >
          {filterQ
            ? `No release matches "${versionFilter}".`
            : `No matching releases.`}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {upcomingVisible.length > 0 && (
            <ReleaseGroup
              label="Upcoming"
              releases={upcomingVisible}
              tasksByRelease={tasksByRelease}
              onSelect={(id) => navigate(`/release/${id}`)}
              hiddenCount={upcomingHidden}
            />
          )}
          {releasedVisible.length > 0 && (
            <ReleaseGroup
              label="Recently released"
              releases={releasedVisible}
              tasksByRelease={tasksByRelease}
              onSelect={(id) => navigate(`/release/${id}`)}
              hiddenCount={releasedHidden}
            />
          )}
        </div>
      )}

      {createOpen && (
        <CreateReleaseModal
          projectId={projectId}
          existingVersions={releases.map((r) => r.version)}
          onClose={(createdId) => {
            setCreateOpen(false);
            if (createdId) navigate(`/release/${createdId}`);
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
  onSelect: (id: string) => void;
}

interface GroupProps extends StripProps {
  label: string;
  hiddenCount: number;
}

function ReleaseGroup({ label, hiddenCount, ...stripProps }: GroupProps) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <TimelineStrip {...stripProps} />
      {hiddenCount > 0 && (
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--mono)",
            fontSize: 9,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          + {hiddenCount} more · search above
        </div>
      )}
    </div>
  );
}

function TimelineStrip({ releases, tasksByRelease, onSelect }: StripProps) {
  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--hairline)",
        borderRadius: 3,
        overflow: "hidden",
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

        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--ui)",
                minWidth: 0,
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dotColor,
                  flexShrink: 0,
                }}
              />
              {/* Title cluster (version + codename) — flexes, truncates with ellipsis */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    color: "var(--ink)",
                    flexShrink: 0,
                  }}
                >
                  {r.version}
                </span>
                {r.name && (
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontStyle: "italic",
                      fontSize: 12,
                      color: "var(--muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {r.name}
                  </span>
                )}
              </span>
              {/* Status tag — fixed-narrow column on the right, never wraps */}
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: dotColor,
                  textAlign: "right",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {released
                  ? shortDate(r.releasedAt!)
                  : inProgress
                    ? `${done}/${tasks.length}`
                    : "Planned"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact date for the sidebar row (e.g. "Jun 4"). The expanded card uses
 *  the longer form via `formatDate`. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
