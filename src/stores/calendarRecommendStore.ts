import { create } from "zustand";

export type CalendarRecommendStatus = "idle" | "streaming" | "ready" | "error";

interface State {
  status: CalendarRecommendStatus;
  error: string | null;
  recommend: string;
  /** ISO range key for the last successful generation — cheap dedupe. */
  lastKey: string | null;
  generate: (fromIso: string, toIso: string) => Promise<void>;
  reset: () => void;
}

function parseRecommend(text: string): string {
  const idx = text.indexOf("RECOMMEND:");
  if (idx < 0) return "";
  return text.slice(idx + "RECOMMEND:".length).trim();
}

export const useCalendarRecommendStore = create<State>((set, get) => ({
  status: "idle",
  error: null,
  recommend: "",
  lastKey: null,

  reset: () => set({ status: "idle", error: null, recommend: "", lastKey: null }),

  generate: async (fromIso, toIso) => {
    const key = `${fromIso}|${toIso}`;
    if (get().status === "streaming") return;
    set({ status: "streaming", error: null, recommend: "" });

    let res: Response;
    try {
      const qs = new URLSearchParams({ from: fromIso, to: toIso });
      res = await fetch(`/api/calendar/recommend?${qs}`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText);
      set({ status: "error", error: text || `HTTP ${res.status}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { response?: string; done?: boolean };
            if (evt.response) accumulated += evt.response;
          } catch {
            // Skip malformed lines.
          }
        }
        set({ recommend: parseRecommend(accumulated) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
      return;
    }

    set({
      status: "ready",
      recommend: parseRecommend(accumulated),
      lastKey: key,
    });
  },
}));
