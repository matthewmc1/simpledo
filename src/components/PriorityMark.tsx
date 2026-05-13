import type { Priority } from "../data/fixtures";

interface Props {
  p: Priority;
  size?: number;
}

export function PriorityMark({ p, size = 10 }: Props) {
  const fills: Record<Priority, string> = {
    P1: "var(--accent)",
    P2: "var(--ink)",
    P3: "var(--muted)",
    P4: "transparent",
  };
  const strokes: Record<Priority, string> = {
    P1: "var(--accent)",
    P2: "var(--ink)",
    P3: "var(--muted)",
    P4: "var(--muted)",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 2,
        background: fills[p],
        border: `1px solid ${strokes[p]}`,
      }}
      aria-label={p}
    />
  );
}
