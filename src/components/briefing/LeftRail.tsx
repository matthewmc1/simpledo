import { Link, useLocation } from "react-router-dom";
import { useCaptureModal } from "../../stores/captureStore";
import { useInboxStore } from "../../stores/inboxStore";
import {
  useEnsureProjectsLoaded,
  useProjectStore,
} from "../../stores/projectStore";
import { useProjectCreateModal } from "../../stores/projectModalStore";
import { useTaskStore } from "../../stores/taskStore";
import { SourceIcon } from "../SourceIcon";

interface ListItem {
  name: string;
  count: number;
  path: string;
}

interface Props {
  /** Optional override — when a view (Project, Task) wants to highlight a project. */
  activeOverride?: string;
}

export function LeftRail({ activeOverride }: Props) {
  useEnsureProjectsLoaded();
  const { pathname } = useLocation();
  const openCapture = useCaptureModal((s) => s.setOpen);
  const openProjectModal = useProjectCreateModal((s) => s.setOpen);
  const projects = useProjectStore((s) => s.projects);
  const todayCount = useTaskStore((s) => s.tasks.filter((t) => t.status === "today").length);
  const nextCount = useTaskStore((s) => s.tasks.filter((t) => t.status === "next").length);
  const waitingCount = useTaskStore((s) => s.tasks.filter((t) => t.status === "waiting").length);
  const somedayCount = useTaskStore((s) => s.tasks.filter((t) => t.status === "someday").length);
  const inboxCount = useInboxStore((s) => s.items.length);

  const LISTS: ListItem[] = [
    { name: "Today", count: todayCount, path: "/" },
    { name: "Inbox", count: inboxCount, path: "/inbox" },
    { name: "Next", count: nextCount, path: "/next" },
    { name: "Waiting", count: waitingCount, path: "/waiting" },
    { name: "Someday", count: somedayCount, path: "/someday" },
  ];

  const activeList = (() => {
    if (activeOverride) return activeOverride;
    if (pathname === "/" ) return "Today";
    if (pathname.startsWith("/inbox")) return "Inbox";
    if (pathname.startsWith("/calendar")) return "Calendar";
    if (pathname.startsWith("/review")) return "Weekly review";
    return "";
  })();

  return (
    <nav
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        overflow: "hidden",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontStyle: "italic",
            color: "var(--paper)",
          }}
        >
          D
        </div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, letterSpacing: "-0.01em" }}>
          Simple <em style={{ fontStyle: "italic" }}>Do</em>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openCapture(true)}
        style={{
          padding: "10px 12px",
          border: "1px dashed rgba(255,255,255,0.2)",
          borderRadius: 4,
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>Capture anything</span>
        <span style={{ background: "rgba(255,255,255,0.08)", padding: "2px 5px", borderRadius: 2, fontSize: 10 }}>⌘N</span>
      </button>

      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 10,
          }}
        >
          Lists
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {LISTS.map((l) => {
            const active = l.name === activeList;
            return (
              <li key={l.name}>
                <Link
                  to={l.path}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 3,
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    fontSize: 13,
                    color: active ? "var(--paper)" : "rgba(255,255,255,0.7)",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: active ? "var(--accent)" : "transparent",
                      }}
                    />
                    {l.name}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{l.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Projects</span>
          <button
            type="button"
            aria-label="New project"
            onClick={() => openProjectModal(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.45)",
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={() => openProjectModal(true)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px dashed rgba(255,255,255,0.2)",
              borderRadius: 4,
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            + New project
          </button>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
            {projects.map((p) => {
              const active = p.name === activeList;
              return (
                <li key={p.id}>
                  <Link
                    to={`/project/${p.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      fontSize: 13,
                      color: active ? "var(--paper)" : "rgba(255,255,255,0.75)",
                      background: active ? "rgba(255,255,255,0.08)" : "transparent",
                      borderRadius: 3,
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      {p.source && (
                        <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                          <SourceIcon source={p.source} size={10} />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 10,
          }}
        >
          Review
        </div>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <li>
            <Link
              to="/review"
              style={{
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: activeList === "Weekly review" ? "var(--paper)" : "rgba(255,255,255,0.7)",
                background: activeList === "Weekly review" ? "rgba(255,255,255,0.08)" : "transparent",
                borderRadius: 3,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: activeList === "Weekly review" ? "var(--accent)" : "transparent",
                }}
              />
              Weekly review
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 2,
                  background: "rgba(168,90,44,0.25)",
                  color: "var(--accent)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Fri
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/calendar"
              style={{
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: activeList === "Calendar" ? "var(--paper)" : "rgba(255,255,255,0.7)",
                background: activeList === "Calendar" ? "rgba(255,255,255,0.08)" : "transparent",
                borderRadius: 3,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: activeList === "Calendar" ? "var(--accent)" : "transparent",
                }}
              />
              Calendar
            </Link>
          </li>
        </ul>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 8,
          }}
        >
          Integrations
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["linear", "jira", "gmail", "calendar", "slack"] as const).map((s) => (
            <span
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              <SourceIcon source={s} size={12} />
            </span>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5dd28b", boxShadow: "0 0 4px #5dd28b" }} />
          Gemma 4B · local
        </div>
      </div>
    </nav>
  );
}
