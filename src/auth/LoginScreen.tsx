import { useState, type FormEvent } from "react";
import { signInDemo, signInEmail, signInGoogle } from "./api";
import { useSession } from "./SessionProvider";

type Busy = "email" | "google" | "demo" | null;

export function LoginScreen() {
  const { setUser } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy("email");
    setError(null);
    try {
      const user = await signInEmail(email);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const onDemo = async () => {
    if (busy) return;
    setBusy("demo");
    setError(null);
    try {
      const user = await signInDemo();
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const onGoogle = () => {
    if (busy) return;
    setBusy("google");
    setError(null);
    signInGoogle();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--ui)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 5,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--serif)",
              fontWeight: 500,
              fontStyle: "italic",
              color: "var(--paper)",
              fontSize: 18,
            }}
          >
            D
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, letterSpacing: "-0.01em" }}>
            Simple <em style={{ fontStyle: "italic" }}>Do</em>
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 12,
          }}
        >
          Welcome
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 400,
            fontSize: 44,
            lineHeight: 1.05,
            margin: "0 0 14px",
            letterSpacing: "-0.02em",
          }}
        >
          Sign in to <em style={{ fontStyle: "italic" }}>Simple Do</em>.
        </h1>
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 16,
            lineHeight: 1.5,
            color: "var(--muted)",
            margin: "0 0 28px",
          }}
        >
          A GTD task manager with a quiet, local-first briefing.
        </p>

        <form onSubmit={onEmail} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            htmlFor="email"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Email
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy === "email"}
              style={{
                flex: 1,
                fontFamily: "var(--ui)",
                fontSize: 15,
                padding: "10px 12px",
                background: "transparent",
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={busy === "email" || !email}
              style={{
                padding: "10px 18px",
                background: "var(--ink)",
                color: "var(--paper)",
                border: "none",
                borderRadius: 4,
                fontFamily: "var(--ui)",
                fontSize: 14,
                fontWeight: 500,
                cursor: busy === "email" ? "default" : "pointer",
                whiteSpace: "nowrap",
                opacity: busy === "email" || !email ? 0.5 : 1,
              }}
            >
              {busy === "email" ? "Signing in…" : "Continue →"}
            </button>
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.05em",
              color: "var(--muted)",
              marginTop: 2,
            }}
          >
            Local mode — no password. We trust whatever you type.
          </div>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "28px 0 18px",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        </div>

        <button
          onClick={onGoogle}
          disabled={!!busy}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "11px 16px",
            background: "transparent",
            color: "var(--ink)",
            border: "1px solid var(--hairline)",
            borderRadius: 4,
            fontFamily: "var(--ui)",
            fontSize: 13,
            fontWeight: 500,
            cursor: busy ? "default" : "pointer",
            opacity: busy && busy !== "google" ? 0.5 : 1,
            marginBottom: 8,
          }}
        >
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </button>

        <button
          onClick={onDemo}
          disabled={!!busy}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "11px 16px",
            background: "transparent",
            color: "var(--muted)",
            border: "1px dashed var(--hairline)",
            borderRadius: 4,
            fontFamily: "var(--ui)",
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy && busy !== "demo" ? 0.5 : 1,
          }}
        >
          {busy === "demo" ? "Loading demo…" : "Try the demo · Mira's Tuesday"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "8px 12px",
              background: "color-mix(in oklch, var(--accent) 8%, var(--paper))",
              border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
              borderRadius: 3,
              fontSize: 12,
              color: "var(--accent)",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: "1px solid var(--hairline)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Local-first</span>
          <span>Gemma 4B · on-device</span>
        </div>
      </div>
    </div>
  );
}
