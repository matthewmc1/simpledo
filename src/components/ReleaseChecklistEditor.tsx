import { useState } from "react";

interface Props {
  items: string[];
  onChange: (next: string[]) => void;
}

/** Edits the project-level definition-of-done — the list of items every
 *  release in the project must satisfy before it's marked released. Each
 *  release tracks its own completion state separately. */
export function ReleaseChecklistEditor({ items, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };
  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      {items.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--muted)",
            margin: "0 0 10px",
          }}
        >
          No checklist yet. Add items every release should satisfy — e.g.
          <em> "QA signed off"</em>, <em>"Docs updated"</em>,{" "}
          <em>"Customers notified"</em>.
        </p>
      ) : (
        <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                fontFamily: "var(--ui)",
                fontSize: 13,
                color: "var(--ink)",
              }}
            >
              <span style={{ color: "var(--muted)", flexShrink: 0 }}>•</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
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
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft("");
            }
          }}
          placeholder="Add a checklist item"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "5px 8px",
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
          onClick={add}
          disabled={!draft.trim()}
          style={{
            background: "transparent",
            border: "1px dashed var(--hairline)",
            color: "var(--muted)",
            padding: "5px 10px",
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
    </div>
  );
}
