interface Props {
  checked?: boolean;
  size?: number;
  onClick?: () => void;
  label?: string;
}

export function Checkbox({ checked = false, size = 14, onClick, label }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Mark not done" : "Mark done")}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        padding: 0,
        borderRadius: 3,
        border: `1px solid ${checked ? "var(--ink)" : "var(--hairline)"}`,
        background: checked ? "var(--ink)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg width={size - 4} height={size - 4} viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5L4 7L8 3"
            stroke="var(--paper)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
