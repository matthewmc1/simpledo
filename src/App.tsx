import { lazy, Suspense, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginScreen } from "./auth/LoginScreen";
import { SessionProvider, useSession } from "./auth/SessionProvider";
import { CaptureModal } from "./components/CaptureModal";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorToasts } from "./components/ErrorToasts";
import { ProjectCreateModal } from "./components/ProjectCreateModal";
import { useCaptureModal } from "./stores/captureStore";
import { useIdleHydration } from "./stores/idleHydration";
import { TweaksPanel } from "./tweaks/TweaksPanel";
import { TweaksProvider } from "./tweaks/TweaksProvider";
// TodayView is the home route — eager so first paint after login has no
// Suspense fallback flash. Every other view is split out to keep the initial
// JS chunk lean.
import { TodayView } from "./views/TodayView";

const InboxView = lazy(() =>
  import("./views/InboxView").then((m) => ({ default: m.InboxView })),
);
const ProjectView = lazy(() =>
  import("./views/ProjectView").then((m) => ({ default: m.ProjectView })),
);
const NextView = lazy(() =>
  import("./views/StatusListView").then((m) => ({ default: m.NextView })),
);
const WaitingView = lazy(() =>
  import("./views/StatusListView").then((m) => ({ default: m.WaitingView })),
);
const SomedayView = lazy(() =>
  import("./views/StatusListView").then((m) => ({ default: m.SomedayView })),
);
const TaskDetailView = lazy(() =>
  import("./views/TaskDetailView").then((m) => ({ default: m.TaskDetailView })),
);
const WeekView = lazy(() =>
  import("./views/WeekView").then((m) => ({ default: m.WeekView })),
);
const WeeklyReviewView = lazy(() =>
  import("./views/WeeklyReviewView").then((m) => ({ default: m.WeeklyReviewView })),
);

/** Minimal placeholder shown for the few hundred ms between route entry and
 *  the lazy chunk arriving. Matches the editorial UI: warm paper, muted mono. */
function RouteFallback() {
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

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function AuthedApp() {
  const setCaptureOpen = useCaptureModal((s) => s.setOpen);
  // Pre-warm Someday + recent Done in idle time so those routes feel instant
  // the first time the user visits them. No-op if the browser is busy.
  useIdleHydration();
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
        <Route path="/inbox" element={<Lazy><InboxView /></Lazy>} />
        <Route path="/next" element={<Lazy><NextView /></Lazy>} />
        <Route path="/waiting" element={<Lazy><WaitingView /></Lazy>} />
        <Route path="/someday" element={<Lazy><SomedayView /></Lazy>} />
        <Route path="/project/:id" element={<Lazy><ProjectView /></Lazy>} />
        <Route path="/task/:id" element={<Lazy><TaskDetailView /></Lazy>} />
        <Route path="/calendar" element={<Lazy><WeekView /></Lazy>} />
        <Route path="/review" element={<Lazy><WeeklyReviewView /></Lazy>} />
        <Route path="*" element={<TodayView />} />
      </Routes>
      <CaptureModal />
      <ProjectCreateModal />
      <CommandPalette />
    </BrowserRouter>
  );
}

function Gate() {
  const { state } = useSession();
  if (state.status === "loading") {
    return <RouteFallback />;
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
