import { useEffect } from "react";
import { create } from "zustand";

export type ReviewStatus = "idle" | "streaming" | "ready" | "error";

interface ReviewState {
  status: ReviewStatus;
  error: string | null;
  recap: string;
  focus: string;
  /** Increments after each completed generation — UI uses it as a render key. */
  generation: number;
  generate: () => Promise<void>;
  reset: () => void;
}

/** Pulls RECAP: and FOCUS: chunks out of accumulated model output. */
function parseSections(text: string): { recap: string; focus: string } {
  const recapIdx = text.indexOf("RECAP:");
  if (recapIdx < 0) return { recap: "", focus: "" };
  const rest = text.slice(recapIdx + "RECAP:".length);
  const focusIdx = rest.indexOf("FOCUS:");
  if (focusIdx < 0) return { recap: rest.trim(), focus: "" };
  return {
    recap: rest.slice(0, focusIdx).trim(),
    focus: rest.slice(focusIdx + "FOCUS:".length).trim(),
  };
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

let inflightController: AbortController | null = null;

export const useReviewStore = create<ReviewState>((set, get) => ({
  status: "idle",
  error: null,
  recap: "",
  focus: "",
  generation: 0,

  reset: () => {
    inflightController?.abort();
    inflightController = null;
    set({ status: "idle", error: null, recap: "", focus: "", generation: 0 });
  },

  generate: async () => {
    if (get().status === "streaming") return;
    inflightController?.abort();
    const controller = new AbortController();
    inflightController = controller;
    set({ status: "streaming", error: null, recap: "", focus: "" });

    let res: Response;
    try {
      res = await fetch("/api/review", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
    } catch (e) {
      if (isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
      if (inflightController === controller) inflightController = null;
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText);
      set({ status: "error", error: text || `HTTP ${res.status}` });
      if (inflightController === controller) inflightController = null;
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
        if (controller.signal.aborted) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { response?: string; done?: boolean };
            if (evt.response) accumulated += evt.response;
          } catch {
            // Malformed line — skip.
          }
        }
        const { recap, focus } = parseSections(accumulated);
        set({ recap, focus });
      }
    } catch (e) {
      if (isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
      if (inflightController === controller) inflightController = null;
      return;
    }

    if (controller.signal.aborted) return;
    const { recap, focus } = parseSections(accumulated);
    set({
      status: "ready",
      recap,
      focus,
      generation: get().generation + 1,
    });
    if (inflightController === controller) inflightController = null;
  },
}));

export function useEnsureReviewGenerated() {
  const status = useReviewStore((s) => s.status);
  const generate = useReviewStore((s) => s.generate);
  useEffect(() => {
    if (status === "idle") void generate();
  }, [status, generate]);
}
