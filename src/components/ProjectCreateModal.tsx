import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../stores/projectStore";
import { useProjectCreateModal } from "../stores/projectModalStore";

const COLOR_SWATCHES = [
  "#a85a2c",
  "#2d5a3d",
  "#5a3da8",
  "#3d4a8a",
  "#b8843d",
  "#807d72",
];

export function ProjectCreateModal() {
  const open = useProjectCreateModal((s) => s.open);
  const setOpen = useProjectCreateModal((s) => s.setOpen);
  const create = useProjectStore((s) => s.createProject);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setColor(COLOR_SWATCHES[0]);
      setDescription("");
      setSaving(false);
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      close();
      return;
    }
    setSaving(true);
    const project = await create({
      name: trimmed,
      color,
      description: description.trim() || undefined,
    });
    setSaving(false);
    if (project) {
      close();
      navigate(`/project/${project.id}`);
    }
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
          gap: 16,
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
          <span>New project</span>
          <span>esc cancel · ⏎ create</span>
        </div>

        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          disabled={saving}
          placeholder="Project name"
          style={{
            width: "100%",
            fontFamily: "var(--serif)",
            fontSize: 24,
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

        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Color
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 5,
                  background: c,
                  border:
                    c === color
                      ? "2px solid var(--ink)"
                      : "1px solid var(--hairline)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="proj-desc"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Description (optional)
          </label>
          <textarea
            id="proj-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project for? What does done look like?"
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              fontFamily: "var(--ui)",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{
              padding: "8px 18px",
              background: "var(--ink)",
              color: "var(--paper)",
              border: "none",
              borderRadius: 4,
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 500,
              cursor: saving || !name.trim() ? "default" : "pointer",
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
