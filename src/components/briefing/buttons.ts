import type { CSSProperties } from "react";

export const btnGhost: CSSProperties = {
  fontFamily: "var(--ui)",
  fontSize: 13,
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid var(--hairline)",
  borderRadius: 3,
  cursor: "pointer",
  color: "var(--ink)",
};

export const btnPrimary: CSSProperties = {
  fontFamily: "var(--ui)",
  fontSize: 13,
  padding: "8px 16px",
  background: "var(--ink)",
  border: "none",
  color: "var(--paper)",
  borderRadius: 3,
  cursor: "pointer",
  fontWeight: 500,
};
