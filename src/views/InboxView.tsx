import { useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { BriefingShell } from "../components/briefing/BriefingShell";
import { ViewHeader } from "../components/briefing/ViewHeader";
import { btnGhost, btnPrimary } from "../components/briefing/buttons";
import { SourceIcon } from "../components/SourceIcon";
import { useCaptureModal } from "../stores/captureStore";
import { useEnsureInboxLoaded, useInboxStore } from "../stores/inboxStore";
import { useTaskStore } from "../stores/taskStore";
import { useTweaks } from "../tweaks/TweaksProvider";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function InboxView() {
  useEnsureInboxLoaded();
  const items = useInboxStore((s) => s.items);
  const inboxStatus = useInboxStore((s) => s.status);
  const processItem = useInboxStore((s) => s.processItem);
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);
  const { tweaks } = useTweaks();
  const showBanner = tweaks.aiProminence !== "quiet";
  const loud = tweaks.aiProminence === "loud";

  const [selectedIndex, setSelectedIndex] = useState(0);
  const focusSinkRef = useRef<HTMLDivElement>(null);

  // Pull focus away from any link in the LeftRail so Enter is ours.
  useEffect(() => {
    focusSinkRef.current?.focus();
  }, []);

  // Keep the cursor within bounds as the list shrinks/grows.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((i) => Math.max(0, Math.min(i, items.length - 1)));
  }, [items.length]);

  const focusItem = (delta: number) =>
    setSelectedIndex((i) =>
      items.length === 0 ? 0 : Math.max(0, Math.min(items.length - 1, i + delta)),
    );

  // Inbox keyboard nav — only when no input/textarea has focus.
  useHotkeys(["j", "down"], (e) => {
    e.preventDefault();
    focusItem(1);
  });
  useHotkeys(["k", "up"], (e) => {
    e.preventDefault();
    focusItem(-1);
  });
  useHotkeys("enter", (e) => {
    const it = items[selectedIndex];
    if (!it) return;
    e.preventDefault();
    void processItem(it.id, "next");
  });
  useHotkeys("d", (e) => {
    const it = items[selectedIndex];
    if (!it) return;
    e.preventDefault();
    void processItem(it.id, "delete");
  });

  const sendAllToNext = async () => {
    const ids = items.map((i) => i.id);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await processItem(id, "next");
    }
    useTaskStore.setState({ status: "idle" });
    await useTaskStore.getState().load();
  };

  // Computed read-out: counts by source + oldest age.
  const readOut = useMemo(() => {
    if (items.length === 0) return null;
    const bySource = new Map<string, number>();
    let oldest = items[0];
    for (const it of items) {
      bySource.set(it.source, (bySource.get(it.source) ?? 0) + 1);
      if (new Date(it.capturedAt) < new Date(oldest.capturedAt)) oldest = it;
    }
    const sources = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${n} from ${s}`)
      .join(", ");
    const oldestAge = relativeTime(oldest.capturedAt);
    return { sources, oldestAge, count: items.length };
  }, [items]);

  return (
    <BriefingShell>
      <ViewHeader
        eyebrow={`Inbox · ${items.length} unprocessed · last sync 2 min ago`}
        title="Process the day's catch"
        actions={
          <>
            {loud && (
              <button style={{ ...btnGhost, color: "var(--accent)", borderColor: "var(--accent)" }}>
                ✦ Ask Gemma
              </button>
            )}
            <button style={btnGhost} onClick={() => setCaptureOpen(true)}>
              + Capture
            </button>
            <button style={btnPrimary} onClick={sendAllToNext} disabled={items.length === 0}>
              Send all to Next
            </button>
          </>
        }
      />

      <div style={{ padding: "24px 40px 40px" }}>
        <div
          ref={focusSinkRef}
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, outline: "none" }}
        />
        {showBanner && readOut && (
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              padding: "16px 20px",
              marginBottom: 28,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              background: "var(--paper)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Read on inbox
              </div>
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 17,
                  lineHeight: 1.4,
                  margin: 0,
                  color: "var(--ink)",
                }}
              >
                {readOut.count} item{readOut.count === 1 ? "" : "s"} to process
                {readOut.sources ? ` — ${readOut.sources}` : ""}. Oldest captured {readOut.oldestAge}{" "}
                ago.
              </p>
            </div>
            <button
              onClick={sendAllToNext}
              disabled={items.length === 0}
              style={{
                background: "var(--ink)",
                color: "var(--paper)",
                border: "none",
                padding: "8px 14px",
                borderRadius: 3,
                fontFamily: "var(--ui)",
                fontSize: 12,
                cursor: items.length === 0 ? "default" : "pointer",
                whiteSpace: "nowrap",
                alignSelf: "center",
                opacity: items.length === 0 ? 0.4 : 1,
              }}
            >
              Send all to Next
            </button>
          </div>
        )}

        {inboxStatus === "loading" && items.length === 0 ? (
          <div
            style={{
              padding: "18px 20px",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              border: "1px dashed var(--hairline)",
              borderRadius: 4,
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--muted)",
              fontSize: 15,
              textAlign: "center",
            }}
          >
            Inbox zero. Press ⌘N to capture something.
          </div>
        ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            border: "1px solid var(--hairline)",
            borderRadius: 4,
            overflow: "hidden",
            background: "var(--paper)",
          }}
        >
          {items.map((item, i) => {
            const selected = i === selectedIndex;
            return (
              <li
                key={item.id}
                onMouseDown={() => setSelectedIndex(i)}
                style={{
                  padding: "18px 20px",
                  borderBottom: i < items.length - 1 ? "1px solid var(--hairline)" : "none",
                  borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
                  display: "grid",
                  gridTemplateColumns: "18px 1fr auto",
                  gap: 16,
                  alignItems: "flex-start",
                  background: selected
                    ? "color-mix(in oklch, var(--accent) 6%, var(--paper))"
                    : "var(--paper)",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "var(--muted)", paddingTop: 3 }}>
                  <SourceIcon source={item.source} size={14} />
                </span>

                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 17, lineHeight: 1.3, marginBottom: 4 }}>
                    {item.text}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                    }}
                  >
                    <span>{item.fromLabel || item.source}</span>
                    <span>·</span>
                    <span>{relativeTime(item.capturedAt)} ago</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button
                    title="Send to Today"
                    aria-label="Send to Today"
                    onClick={() => void processItem(item.id, "today")}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 3,
                      border: "1px solid var(--accent)",
                      background: "var(--accent)",
                      color: "var(--paper)",
                      cursor: "pointer",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✓
                  </button>
                  <button
                    title="Send to Next"
                    aria-label="Send to Next"
                    onClick={() => void processItem(item.id, "next")}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 3,
                      border: "1px solid var(--hairline)",
                      background: "var(--paper)",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    →
                  </button>
                  <button
                    title="Delete"
                    aria-label="Delete"
                    onClick={() => void processItem(item.id, "delete")}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 3,
                      border: "1px solid var(--hairline)",
                      background: "var(--paper)",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        )}

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span>j/k navigate · ⏎ send to Next · d delete</span>
          <span>{items.length === 0 ? "Inbox zero." : `${items.length} to process`}</span>
        </div>
      </div>
    </BriefingShell>
  );
}
