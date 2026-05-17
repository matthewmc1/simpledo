import { useEffect } from "react";
import { create } from "zustand";
import type {
  CreateReleaseInput,
  Release,
  UpdateReleaseInput,
} from "@shared/types";

/** Stable empty array — returning `[]` from a selector creates a new
 *  reference every render and trips React's getSnapshot identity check
 *  ("Maximum update depth exceeded"). Selectors must fall back to this. */
export const EMPTY_RELEASES: Release[] = [];
import {
  createRelease as apiCreate,
  deleteRelease as apiDelete,
  fetchReleases,
  patchRelease,
} from "../api/releases";
import type { LoadStatus } from "./types";

/** Parses MAJOR.MINOR.PATCH into a sortable tuple. */
function semverTuple(v: string): [number, number, number] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function compareSemver(a: Release, b: Release): number {
  const [aM, aN, aP] = semverTuple(a.version);
  const [bM, bN, bP] = semverTuple(b.version);
  if (aM !== bM) return aM - bM;
  if (aN !== bN) return aN - bN;
  return aP - bP;
}

interface ReleaseState {
  /** Per-project load status — we lazy-fetch releases when a project view opens. */
  loaded: Map<string, LoadStatus>;
  error: string | null;
  /** Map of projectId → ordered releases (semver-asc). */
  byProject: Map<string, Release[]>;

  ensureLoaded: (projectId: string) => Promise<void>;
  reset: () => void;
  createRelease: (
    projectId: string,
    input: CreateReleaseInput,
  ) => Promise<Release | null>;
  updateRelease: (id: string, input: UpdateReleaseInput) => Promise<void>;
  deleteRelease: (id: string) => Promise<void>;
}

export const useReleaseStore = create<ReleaseState>((set, get) => {
  function locateRelease(id: string): { projectId: string; index: number } | null {
    for (const [projectId, list] of get().byProject) {
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) return { projectId, index: idx };
    }
    return null;
  }

  async function optimistic(
    projectId: string,
    nextList: Release[],
    call: () => Promise<unknown>,
  ) {
    const prev = get().byProject.get(projectId) ?? [];
    const nextMap = new Map(get().byProject);
    nextMap.set(projectId, [...nextList].sort(compareSemver));
    set({ byProject: nextMap, error: null });
    try {
      await call();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const rollback = new Map(get().byProject);
      rollback.set(projectId, prev);
      set({ byProject: rollback, error: message });
      console.error("Release mutation failed, rolled back:", message);
    }
  }

  return {
    loaded: new Map(),
    error: null,
    byProject: new Map(),

    ensureLoaded: async (projectId) => {
      const current = get().loaded.get(projectId);
      if (current === "loading" || current === "ready") return;
      const next = new Map(get().loaded);
      next.set(projectId, "loading");
      set({ loaded: next });
      try {
        const releases = await fetchReleases(projectId);
        const sorted = [...releases].sort(compareSemver);
        const byProject = new Map(get().byProject);
        byProject.set(projectId, sorted);
        const loaded = new Map(get().loaded);
        loaded.set(projectId, "ready");
        set({ byProject, loaded });
      } catch (e) {
        const loaded = new Map(get().loaded);
        loaded.set(projectId, "error");
        set({
          loaded,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    reset: () => set({ loaded: new Map(), error: null, byProject: new Map() }),

    createRelease: async (projectId, input) => {
      try {
        const created = await apiCreate(projectId, input);
        const existing = get().byProject.get(projectId) ?? [];
        const byProject = new Map(get().byProject);
        byProject.set(projectId, [...existing, created].sort(compareSemver));
        set({ byProject, error: null });
        return created;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set({ error: message });
        console.error("createRelease failed:", message);
        return null;
      }
    },

    updateRelease: async (id, input) => {
      const loc = locateRelease(id);
      if (!loc) return;
      const list = get().byProject.get(loc.projectId) ?? [];
      const next = list.map((r) =>
        r.id === id
          ? {
              ...r,
              ...input,
              releasedAt: input.releasedAt ?? r.releasedAt,
              updatedAt: new Date().toISOString(),
            }
          : r,
      );
      await optimistic(loc.projectId, next, () => patchRelease(id, input));
    },

    deleteRelease: async (id) => {
      const loc = locateRelease(id);
      if (!loc) return;
      const list = get().byProject.get(loc.projectId) ?? [];
      const next = list.filter((r) => r.id !== id);
      await optimistic(loc.projectId, next, () => apiDelete(id));
    },
  };
});

export function useEnsureReleasesLoaded(projectId: string | undefined) {
  const ensure = useReleaseStore((s) => s.ensureLoaded);
  useEffect(() => {
    if (!projectId) return;
    void ensure(projectId);
  }, [projectId, ensure]);
}
