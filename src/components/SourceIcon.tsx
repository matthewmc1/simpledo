import type { IntegrationSource } from "../data/fixtures";

interface Props {
  source: IntegrationSource | string;
  size?: number;
  color?: string;
}

export function SourceIcon({ source, size = 14, color }: Props) {
  const c = color || "currentColor";
  const s = size;
  if (source === "linear")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Linear">
        <path d="M2 9.5L6.5 14M2 6.5L9.5 14M3 3.5L12.5 13M5.5 2L14 10.5M9 2L14 7M12.5 2L14 3.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  if (source === "jira")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Jira">
        <path d="M8 1L14 8L11 11L8 8L5 11L11 11" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5 5L8 8L5 11L2 8L5 5Z" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  if (source === "gmail" || source === "email")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Email">
        <rect x="1.5" y="3.5" width="13" height="9" rx="0.5" stroke={c} strokeWidth="1.1" />
        <path d="M2 4.5L8 9L14 4.5" stroke={c} strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    );
  if (source === "slack")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Slack">
        <rect x="2" y="5.5" width="12" height="2" rx="1" stroke={c} strokeWidth="1.1" />
        <rect x="2" y="8.5" width="12" height="2" rx="1" stroke={c} strokeWidth="1.1" />
        <rect x="5.5" y="2" width="2" height="12" rx="1" stroke={c} strokeWidth="1.1" />
        <rect x="8.5" y="2" width="2" height="12" rx="1" stroke={c} strokeWidth="1.1" />
      </svg>
    );
  if (source === "calendar")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Calendar">
        <rect x="1.5" y="3" width="13" height="11" rx="1" stroke={c} strokeWidth="1.1" />
        <path d="M1.5 6.5H14.5M5 1.5V4M11 1.5V4" stroke={c} strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  if (source === "manual")
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-label="Manual">
        <path d="M3 12L4 8L11 1L14 4L7 11L3 12Z" stroke={c} strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    );
  return null;
}
