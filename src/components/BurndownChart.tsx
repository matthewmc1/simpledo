import { useMemo } from "react";
import type { Task } from "@shared/types";

interface Props {
  tasks: Task[];
  /** How many days back to plot. Default 30. */
  days?: number;
  /** Container width — height is derived. */
  width?: number;
  height?: number;
}

/** Open-task burndown for a project. For each day in the window, counts how
 *  many tasks were "open" (i.e. created on or before that day, and not yet
 *  done — using `updatedAt` as the proxy for done timestamp). Plotted as a
 *  thin copper line. Pure SVG — no chart library, no external deps. */
export function BurndownChart({ tasks, days = 30, width = 280, height = 110 }: Props) {
  const series = useMemo(() => computeSeries(tasks, days), [tasks, days]);

  if (series.length === 0) return null;

  const maxValue = Math.max(...series.map((s) => s.open), 1);
  const padding = { top: 8, right: 4, bottom: 18, left: 4 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const stepX = w / Math.max(series.length - 1, 1);

  const points = series
    .map((s, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + h - (s.open / maxValue) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const firstY = padding.top + h - (series[0].open / maxValue) * h;
  const lastY = padding.top + h - (series[series.length - 1].open / maxValue) * h;
  const areaPath =
    `M ${padding.left},${padding.top + h} L ${padding.left},${firstY.toFixed(1)} ` +
    series
      .map((s, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + h - (s.open / maxValue) * h;
        return `L ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") +
    ` L ${(padding.left + (series.length - 1) * stepX).toFixed(1)},${padding.top + h} Z`;

  const first = series[0];
  const last = series[series.length - 1];
  const delta = last.open - first.open;
  const trend = delta < 0 ? "down" : delta > 0 ? "up" : "flat";

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Open task burndown — ${first.open} → ${last.open} over ${days} days`}
        style={{ display: "block" }}
      >
        {/* Baseline */}
        <line
          x1={padding.left}
          x2={padding.left + w}
          y1={padding.top + h}
          y2={padding.top + h}
          stroke="var(--hairline)"
          strokeWidth={1}
        />
        {/* Filled area */}
        <path
          d={areaPath}
          fill="color-mix(in oklch, var(--accent) 12%, transparent)"
        />
        {/* Line */}
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          points={points}
        />
        {/* End-of-line dot */}
        <circle
          cx={padding.left + (series.length - 1) * stepX}
          cy={lastY}
          r={2.5}
          fill="var(--accent)"
        />
        {/* Axis labels: range start / end */}
        <text
          x={padding.left}
          y={height - 4}
          fontFamily="var(--mono)"
          fontSize={9}
          fill="var(--muted)"
          textAnchor="start"
        >
          {labelDate(first.day)}
        </text>
        <text
          x={padding.left + w}
          y={height - 4}
          fontFamily="var(--mono)"
          fontSize={9}
          fill="var(--muted)"
          textAnchor="end"
        >
          today
        </text>
      </svg>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--muted)",
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <span>{last.open} open today</span>
        <span style={{ color: trend === "down" ? "#2d7a4c" : trend === "up" ? "var(--accent)" : "var(--muted)" }}>
          {trend === "flat" ? "no change" : `${delta > 0 ? "+" : ""}${delta} in ${days}d`}
        </span>
      </div>
    </div>
  );
}

function computeSeries(tasks: Task[], days: number): { day: number; open: number }[] {
  if (tasks.length === 0) return [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const out: { day: number; open: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - i);
    const cutoffMs = cutoff.getTime();
    let open = 0;
    for (const t of tasks) {
      const created = new Date(t.createdAt).getTime();
      if (created > cutoffMs) continue;
      // Task was open on `cutoff` if it wasn't done yet, OR was completed
      // after `cutoff`. We use updatedAt as the proxy for done timestamp —
      // accurate when status=done was the last mutation, mildly off otherwise.
      if (t.status !== "done") {
        open++;
      } else if (new Date(t.updatedAt).getTime() > cutoffMs) {
        open++;
      }
    }
    out.push({ day: cutoffMs, open });
  }
  return out;
}

function labelDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
