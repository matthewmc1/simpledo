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
import { NextView, SomedayView, WaitingView } from "./views/StatusListView";
import { TaskDetailView } from "./views/TaskDetailView";
import { WeekView } from "./views/WeekView";
import { WeeklyReviewView } from "./views/WeeklyReviewView";

function AuthedApp() {
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);
  // ⌘K / Ctrl+K opens the capture modal. We avoid ⌘N because Chrome and
  // Safari both swallow that for "new window" before JS can preventDefault.
  useHotkeys(
    "mod+k",
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
        <Route path="/next" element={<NextView />} />
        <Route path="/waiting" element={<WaitingView />} />
        <Route path="/someday" element={<SomedayView />} />
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
