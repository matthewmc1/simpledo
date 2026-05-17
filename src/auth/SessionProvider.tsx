import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useBriefingStore } from "../stores/briefingStore";
import { useCalendarRecommendStore } from "../stores/calendarRecommendStore";
import { useInboxStore } from "../stores/inboxStore";
import { useProjectStore } from "../stores/projectStore";
import { useReleaseStore } from "../stores/releaseStore";
import { useReviewStore } from "../stores/reviewStore";
import { useTaskStore } from "../stores/taskStore";
import { fetchMe, signOut as apiSignOut, type ClientUser } from "./api";

type SessionState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: ClientUser };

interface Ctx {
  state: SessionState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: ClientUser) => void;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });

  const refresh = useCallback(async () => {
    const user = await fetchMe();
    setState(user ? { status: "authenticated", user } : { status: "anonymous", user: null });
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    useTaskStore.getState().reset();
    useProjectStore.getState().reset();
    useInboxStore.getState().reset();
    useBriefingStore.getState().reset();
    useReviewStore.getState().reset();
    useCalendarRecommendStore.getState().reset();
    useReleaseStore.getState().reset();
    setState({ status: "anonymous", user: null });
  }, []);

  const setUser = useCallback((user: ClientUser) => {
    setState({ status: "authenticated", user });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(() => ({ state, refresh, signOut, setUser }), [state, refresh, signOut, setUser]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
