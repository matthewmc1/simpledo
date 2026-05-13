import { useBriefingStore } from "../stores/briefingStore";
import { useInboxStore } from "../stores/inboxStore";
import { useProjectStore } from "../stores/projectStore";
import { useTaskStore } from "../stores/taskStore";

interface ToastSpec {
  label: string;
  message: string;
  dismiss: () => void;
}

export function ErrorToasts() {
  const taskError = useTaskStore((s) => s.error);
  const inboxError = useInboxStore((s) => s.error);
  const projectError = useProjectStore((s) => s.error);
  const briefingError = useBriefingStore((s) => s.error);

  const toasts: ToastSpec[] = [];
  if (taskError)
    toasts.push({
      label: "Tasks",
      message: taskError,
      dismiss: () => useTaskStore.setState({ error: null }),
    });
  if (inboxError)
    toasts.push({
      label: "Inbox",
      message: inboxError,
      dismiss: () => useInboxStore.setState({ error: null }),
    });
  if (projectError)
    toasts.push({
      label: "Projects",
      message: projectError,
      dismiss: () => useProjectStore.setState({ error: null }),
    });
  if (briefingError)
    toasts.push({
      label: "Gemma",
      message: briefingError,
      dismiss: () => useBriefingStore.setState({ error: null }),
    });

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 2147483640,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.label}
          role="alert"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: 6,
            padding: "10px 12px",
            fontFamily: "var(--ui)",
            fontSize: 13,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: 4,
              }}
            >
              {t.label} · error
            </div>
            <div style={{ lineHeight: 1.4 }}>{t.message}</div>
          </div>
          <button
            onClick={t.dismiss}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
              lineHeight: 1,
              alignSelf: "start",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
