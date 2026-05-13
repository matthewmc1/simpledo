import type { ReactNode } from "react";
import { LeftRail } from "./LeftRail";

interface Props {
  children: ReactNode;
  activeOverride?: string;
}

export function BriefingShell({ children, activeOverride }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--ui)",
        fontSize: 14,
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        overflow: "hidden",
      }}
    >
      <LeftRail activeOverride={activeOverride} />
      <main style={{ overflow: "auto", minWidth: 0 }}>{children}</main>
    </div>
  );
}
