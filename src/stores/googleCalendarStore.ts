import { create } from "zustand";
import {
  fetchGoogleEvents,
  fetchGoogleStatus,
  type GoogleEvent,
  type GoogleStatus,
} from "../api/google";

interface State {
  status: GoogleStatus | null;
  statusLoading: boolean;
  /** Range -> events. We cache the most recent fetched range so flipping
   *  back/forth doesn't refire the API. */
  events: GoogleEvent[];
  rangeKey: string | null;
  loadingEvents: boolean;
  error: string | null;

  loadStatus: () => Promise<void>;
  loadEvents: (fromIso: string, toIso: string) => Promise<void>;
  reset: () => void;
}

export const EMPTY_EVENTS: GoogleEvent[] = [];

export const useGoogleCalendarStore = create<State>((set, get) => ({
  status: null,
  statusLoading: false,
  events: [],
  rangeKey: null,
  loadingEvents: false,
  error: null,

  reset: () =>
    set({
      status: null,
      statusLoading: false,
      events: [],
      rangeKey: null,
      loadingEvents: false,
      error: null,
    }),

  loadStatus: async () => {
    if (get().statusLoading) return;
    set({ statusLoading: true });
    try {
      const status = await fetchGoogleStatus();
      set({ status, statusLoading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ statusLoading: false, error: msg });
    }
  },

  loadEvents: async (fromIso, toIso) => {
    const key = `${fromIso}|${toIso}`;
    if (get().rangeKey === key && get().events.length >= 0 && !get().loadingEvents) {
      // Already fetched for this range — no-op.
      // (The events array may legitimately be empty, but we still skip refetching.)
      return;
    }
    if (get().loadingEvents) return;
    set({ loadingEvents: true, error: null });
    try {
      const events = await fetchGoogleEvents(fromIso, toIso);
      set({ events, rangeKey: key, loadingEvents: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loadingEvents: false, error: msg });
    }
  },
}));
