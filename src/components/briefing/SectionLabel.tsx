interface Props {
  label: string;
  small?: boolean;
}

export function SectionLabel({ label, small = false }: Props) {
  return (
    <div
      style={{
        fontFamily: "var(--mono)",
        fontSize: small ? 10 : 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: small ? "none" : "1px solid var(--hairline)",
      }}
    >
      {label}
    </div>
  );
}
