import { useEffect } from "react";
import { create } from "zustand";
import type { InboxItem, ProcessDestination } from "@shared/types";
import {
  captureInbox,
  deleteInboxItem,
  fetchInbox,
  processInboxItem,
} from "../api/inbox";
import { useTaskStore } from "./taskStore";
import type { LoadStatus } from "./types";

interface InboxState {
  status: LoadStatus;
  error: string | null;
  items: InboxItem[];
  load: () => Promise<void>;
  reset: () => void;
  capture: (text: string) => Promise<InboxItem | null>;
  processItem: (
    id: string,
    destination: ProcessDestination,
  ) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useInboxStore = create<InboxState>((set, get) => {
  /** Mutation helper: apply optimistic state, call server, rollback on error. */
  async function optimistic<T>(
    next: InboxItem[],
    call: () => Promise<T>,
  ): Promise<T | null> {
    const prev = get().items;
    set({ items: next, error: null });
    try {
      return await call();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ items: prev, error: message });
      console.error("Inbox mutation failed, rolled back:", message);
      return null;
    }
  }

  return {
    status: "idle",
    error: null,
    items: [],
    load: async () => {
      if (get().status === "loading") return;
      set({ status: "loading", error: null });
      try {
        const items = await fetchInbox();
        set({ status: "ready", items });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },
    reset: () => set({ status: "idle", error: null, items: [] }),

    capture: async (rawText) => {
      const text = rawText.trim();
      if (!text) return null;
      // Optimistic temporary row — replaced with the server's row on success.
      const tempId = `temp-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const temp: InboxItem = {
        id: tempId,
        text,
        source: "manual",
        fromLabel: null,
        capturedAt: nowIso,
        createdAt: nowIso,
      };
      const next = [...get().items, temp];
      const created = await optimistic(next, () => captureInbox({ text }));
      if (!created) return null;
      // Replace the temp row with the real one.
      set({
        items: get().items.map((i) => (i.id === tempId ? created : i)),
      });
      return created;
    },

    processItem: async (id, destination) => {
      const next = get().items.filter((i) => i.id !== id);
      const result = await optimistic(next, () =>
        processInboxItem(id, { destination }),
      );
      if (result?.task) {
        useTaskStore.getState().appendTask(result.task);
      }
    },

    deleteItem: async (id) => {
      const next = get().items.filter((i) => i.id !== id);
      await optimistic(next, () => deleteInboxItem(id));
    },
  };
});

export function useEnsureInboxLoaded() {
  const status = useInboxStore((s) => s.status);
  const load = useInboxStore((s) => s.load);
  useEffect(() => {
    if (status === "idle") load();
  }, [status, load]);
}
