import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { searchTasks, type SearchHit } from "../api/tasks";
import { useProjectStore } from "../stores/projectStore";

/** Global ⌘P / Ctrl+P palette. Hits `/api/tasks/search` (tsvector GIN index)
 *  on every keystroke after a small debounce. Click or ⏎ to navigate to the
 *  matched task; Esc to close. Designed to scale to millions of tasks — the
 *  server caps results at 20 and the index is `O(log n)` for typical queries. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);

  // ⌘P / Ctrl+P opens. We register a window-level *capture-phase* listener
  // so we beat the browser's print accelerator. Bubble-phase listeners
  // (which is what react-hotkeys-hook uses) fire after the browser default
  // on some platforms, so we'd lose the race and the print dialog would
  // open anyway.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      // Match `p`/`P` without modifier confusion (alt+p would otherwise fire too).
      if (e.key !== "p" && e.key !== "P") return;
      if (e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActiveIdx(0);
      // Focus after the modal mounts.
      const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(raf);
    }
    return undefined;
  }, [open]);

  // Debounced search — fires 120ms after the last keystroke, cancels on
  // unmount or fresh keystroke. AbortController prevents stale responses
  // from clobbering newer ones when the user types fast.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const results = await searchTasks(q);
        if (controller.signal.aborted) return;
        setHits(results);
        setActiveIdx(0);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.error("Search failed:", e);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [q, open]);

  if (!open) return null;

  const close = () => setOpen(false);

  const choose = (id: string) => {
    close();
    navigate(`/task/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) choose(hit.id);
    }
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "color-mix(in oklch, var(--ink) 35%, transparent)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "14vh 24px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--paper)",
          borderRadius: 6,
          boxShadow: "0 24px 60px rgba(0,0,0,0.24)",
          fontFamily: "var(--ui)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--hairline)",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
              flexShrink: 0,
            }}
          >
            Find
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search your tasks — title, notes, client descriptions"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "var(--serif)",
              fontSize: 18,
              color: "var(--ink)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.05em",
              color: "var(--muted)",
              flexShrink: 0,
            }}
          >
            {searching ? "…" : `${hits.length}`}
          </span>
        </div>

        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: 380,
            overflowY: "auto",
          }}
        >
          {hits.length === 0 && q.trim() && !searching ? (
            <li
              style={{
                padding: "16px 18px",
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                color: "var(--muted)",
                fontSize: 14,
              }}
            >
              No matches.
            </li>
          ) : (
            hits.map((h, i) => {
              const project = h.projectId
                ? projects.find((p) => p.id === h.projectId)
                : null;
              const active = i === activeIdx;
              return (
                <li key={h.id}>
                  <Link
                    to={`/task/${h.id}`}
                    onClick={() => close()}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 12,
                      alignItems: "baseline",
                      padding: "10px 16px",
                      background: active
                        ? "color-mix(in oklch, var(--accent) 8%, var(--paper))"
                        : "transparent",
                      textDecoration: "none",
                      color: "var(--ink)",
                      borderLeft: active
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        minWidth: 60,
                      }}
                    >
                      {h.status}
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.35, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--serif)" }}>{h.title}</span>
                      {project && (
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 10,
                            letterSpacing: "0.04em",
                            color: "var(--muted)",
                            marginLeft: 8,
                          }}
                        >
                          {project.name}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        color: h.dueText?.startsWith("Today")
                          ? "var(--accent)"
                          : "var(--muted)",
                      }}
                    >
                      {h.dueText ?? h.priority}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>

        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--hairline)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>↑↓ navigate · ⏎ open · esc close</span>
          <span>⌘P</span>
        </div>
      </div>
    </div>
  );
}
