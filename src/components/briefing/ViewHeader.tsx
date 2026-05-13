import type { ReactNode } from "react";

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: boolean;
  actions?: ReactNode;
}

export function ViewHeader({ eyebrow, title, italic, actions }: Props) {
  return (
    <header
      style={{
        padding: "28px 40px 18px",
        borderBottom: "1px solid var(--hairline)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 20,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
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
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 400,
            fontSize: 42,
            lineHeight: 1,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {italic ? <em style={{ fontStyle: "italic" }}>{title}</em> : title}
        </h1>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {actions}
      </div>
    </header>
  );
}
