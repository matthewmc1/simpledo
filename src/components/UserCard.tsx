import { useEffect, useRef, useState } from "react";
import { useSession } from "../auth/SessionProvider";
import { useGoogleCalendarStore } from "../stores/googleCalendarStore";

/** Renders user identity + sign-out at the bottom of the LeftRail.
 *  Clicking the row toggles a small menu with profile details and actions. */
export function UserCard() {
  const { state, signOut } = useSession();
  const googleStatus = useGoogleCalendarStore((s) => s.status);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (state.status !== "authenticated") return null;

  const user = state.user;
  const initials = computeInitials(user.name || user.email);
  const method = user.isDemo
    ? "Demo"
    : googleStatus?.connected
      ? "Google"
      : "Email";

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      console.error("Sign-out failed:", e);
      setSigningOut(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          background: open ? "rgba(255,255,255,0.06)" : "transparent",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          cursor: "pointer",
          color: "var(--paper)",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "var(--paper)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontFamily: "var(--ui)",
              fontSize: 13,
              color: "var(--paper)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.name || user.email}
          </span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {method}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            color: "rgba(255,255,255,0.5)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "var(--paper)",
            color: "var(--ink)",
            borderRadius: 4,
            boxShadow: "0 16px 40px rgba(0,0,0,0.32)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            zIndex: 20,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 4,
              }}
            >
              Signed in as
            </div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 15,
                lineHeight: 1.25,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.name || user.email}
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--muted)",
              letterSpacing: "0.04em",
              borderTop: "1px solid var(--hairline)",
              paddingTop: 10,
            }}
          >
            <Row label="Method" value={method.toUpperCase()} />
            <Row
              label="Calendar"
              value={
                user.isDemo
                  ? "Demo"
                  : googleStatus === null
                    ? "Checking…"
                    : googleStatus.calendarScopeGranted
                      ? "Linked"
                      : googleStatus.connected
                        ? "Needs reconsent"
                        : "Not connected"
              }
            />
          </div>

          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            style={{
              marginTop: 4,
              padding: "8px 12px",
              background: "var(--ink)",
              color: "var(--paper)",
              border: "none",
              borderRadius: 3,
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 500,
              cursor: signingOut ? "default" : "pointer",
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{label}</span>
      <span style={{ color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

function computeInitials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  // Strip an email domain so we don't get "matthew@gmail.com" → "M@".
  const base = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const parts = base.split(/\s+|[-_.]/).filter(Boolean);
  if (parts.length === 0) return base.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
