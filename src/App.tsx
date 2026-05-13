import { useHotkeys } from "react-hotkeys-hook";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginScreen } from "./auth/LoginScreen";
import { SessionProvider, useSession } from "./auth/SessionProvider";
import { CaptureModal } from "./components/CaptureModal";
import { ErrorToasts } from "./components/ErrorToasts";
import { ProjectCreateModal } from "./components/ProjectCreateModal";
import { useCaptureModal } from "./stores/captureStore";
import { TweaksPanel } from "./tweaks/TweaksPanel";
import { TweaksProvider } from "./tweaks/TweaksProvider";
import { TodayView } from "./views/TodayView";
import { InboxView } from "./views/InboxView";
import { ProjectView } from "./views/ProjectView";
import { TaskDetailView } from "./views/TaskDetailView";
import { WeekView } from "./views/WeekView";
import { WeeklyReviewView } from "./views/WeeklyReviewView";

function AuthedApp() {
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);
  // ⌘N / Ctrl+N opens the capture modal. preventDefault is best-effort —
  // Chrome on Mac occasionally still handles ⌘N as "new window".
  useHotkeys(
    "mod+n",
    (e) => {
      e.preventDefault();
      setCaptureOpen(true);
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TodayView />} />
        <Route path="/inbox" element={<InboxView />} />
        <Route path="/project/:id" element={<ProjectView />} />
        <Route path="/task/:id" element={<TaskDetailView />} />
        <Route path="/calendar" element={<WeekView />} />
        <Route path="/review" element={<WeeklyReviewView />} />
        <Route path="*" element={<TodayView />} />
      </Routes>
      <CaptureModal />
      <ProjectCreateModal />
    </BrowserRouter>
  );
}

function Gate() {
  const { state } = useSession();
  if (state.status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--paper)",
          color: "var(--muted)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Loading…
      </div>
    );
  }
  if (state.status === "anonymous") return <LoginScreen />;
  return <AuthedApp />;
}

export function App() {
  return (
    <TweaksProvider>
      <SessionProvider>
        <Gate />
        <ErrorToasts />
        <TweaksPanel />
      </SessionProvider>
    </TweaksProvider>
  );
}
