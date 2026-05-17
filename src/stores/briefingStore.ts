import { useEffect } from "react";
import { create } from "zustand";

export type BriefingStatus = "idle" | "streaming" | "ready" | "error";

interface BriefingState {
  status: BriefingStatus;
  error: string | null;
  headline: string;
  summary: string;
  /** Number of completed generations — used as a render key for re-runs. */
  generation: number;
  generate: () => Promise<void>;
  reset: () => void;
}

/** Pulls the HEADLINE: and SUMMARY: chunks out of accumulated model output. */
function parseSections(text: string): { headline: string; summary: string } {
  // Strip anything before "HEADLINE:" (some models add a preamble).
  const headlineIdx = text.indexOf("HEADLINE:");
  if (headlineIdx < 0) return { headline: "", summary: "" };
  const rest = text.slice(headlineIdx + "HEADLINE:".length);

  const summaryIdx = rest.indexOf("SUMMARY:");
  if (summaryIdx < 0) {
    return { headline: rest.trim(), summary: "" };
  }
  const headline = rest.slice(0, summaryIdx).trim();
  const summary = rest.slice(summaryIdx + "SUMMARY:".length).trim();
  return { headline, summary };
}

/** Distinguishes user-initiated cancellations from real network errors. */
function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Module-scoped — not in store state because AbortController is not
 *  serialisable and React doesn't need to re-render when it changes. */
let inflightController: AbortController | null = null;

export const useBriefingStore = create<BriefingState>((set, get) => ({
  status: "idle",
  error: null,
  headline: "",
  summary: "",
  generation: 0,

  reset: () => {
    inflightController?.abort();
    inflightController = null;
    set({ status: "idle", error: null, headline: "", summary: "", generation: 0 });
  },

  generate: async () => {
    if (get().status === "streaming") return;
    // Abort any prior stream — there shouldn't be one (status === idle/ready/error),
    // but belt-and-braces in case `generate()` is fired again before status flips.
    inflightController?.abort();
    const controller = new AbortController();
    inflightController = controller;
    set({ status: "streaming", error: null, headline: "", summary: "" });

    let res: Response;
    try {
      res = await fetch("/api/briefing", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
    } catch (e) {
      if (isAbortError(e)) return; // intentional cancel; leave state alone
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

        // Ollama emits NDJSON — process complete lines, retain the trailing partial.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { response?: string; done?: boolean };
            if (evt.response) accumulated += evt.response;
          } catch {
            // Skip malformed lines (Ollama is usually well-behaved).
          }
        }
        const { headline, summary } = parseSections(accumulated);
        set({ headline, summary });
      }
    } catch (e) {
      if (isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
      if (inflightController === controller) inflightController = null;
      return;
    }

    if (controller.signal.aborted) return;
    const { headline, summary } = parseSections(accumulated);
    set({
      status: "ready",
      headline,
      summary,
      generation: get().generation + 1,
    });
    if (inflightController === controller) inflightController = null;
  },
}));

export function useEnsureBriefingGenerated() {
  const status = useBriefingStore((s) => s.status);
  const generate = useBriefingStore((s) => s.generate);
  useEffect(() => {
    if (status === "idle") void generate();
  }, [status, generate]);
}
