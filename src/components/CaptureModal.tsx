import { useEffect, useRef, useState } from "react";
import { useCaptureModal } from "../stores/captureStore";
import { useInboxStore } from "../stores/inboxStore";

export function CaptureModal() {
  const open = useCaptureModal((s) => s.open);
  const setOpen = useCaptureModal((s) => s.setOpen);
  const capture = useInboxStore((s) => s.capture);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input and clear it whenever the modal opens.
  useEffect(() => {
    if (open) {
      setText("");
      setSaving(false);
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      close();
      return;
    }
    setSaving(true);
    const result = await capture(trimmed);
    setSaving(false);
    if (result) close();
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "color-mix(in oklch, var(--ink) 35%, transparent)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "16vh",
        padding: "16vh 24px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
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
          <span>Capture · drops into Inbox</span>
          <span style={{ display: "flex", gap: 8 }}>
            <kbd style={kbdStyle}>esc</kbd>
            <span>cancel</span>
            <kbd style={kbdStyle}>⏎</kbd>
            <span>save</span>
          </span>
        </div>

        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          disabled={saving}
          placeholder="What's on your mind?"
          style={{
            width: "100%",
            fontFamily: "var(--serif)",
            fontSize: 22,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--ink)",
            outline: "none",
            padding: "4px 0 8px",
          }}
        />

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {saving ? "Saving…" : "Capture now, process later."}
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  padding: "1px 5px",
  border: "1px solid var(--hairline)",
  borderRadius: 2,
  textTransform: "none",
  letterSpacing: 0,
};
