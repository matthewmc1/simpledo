import { useEffect } from "react";
import { create } from "zustand";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@shared/types";
import {
  createProject as apiCreate,
  deleteProject as apiDelete,
  fetchProjects,
  patchProject,
} from "../api/projects";
import type { LoadStatus } from "./types";

interface ProjectState {
  status: LoadStatus;
  error: string | null;
  projects: Project[];
  load: () => Promise<void>;
  reset: () => void;
  createProject: (input: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  async function optimistic<T>(
    next: Project[],
    call: () => Promise<T>,
  ): Promise<T | null> {
    const prev = get().projects;
    set({ projects: next, error: null });
    try {
      return await call();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ projects: prev, error: message });
      console.error("Project mutation failed, rolled back:", message);
      return null;
    }
  }

  return {
    status: "idle",
    error: null,
    projects: [],
    load: async () => {
      if (get().status === "loading") return;
      set({ status: "loading", error: null });
      try {
        const projects = await fetchProjects();
        set({ status: "ready", projects });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },
    reset: () => set({ status: "idle", error: null, projects: [] }),

    createProject: async (input) => {
      // Server returns the created row — append to local state, no optimistic
      // placeholder (we want the real id).
      try {
        const project = await apiCreate(input);
        set({ projects: [...get().projects, project], error: null });
        return project;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set({ error: message });
        console.error("createProject failed:", message);
        return null;
      }
    },

    updateProject: async (id, input) => {
      const target = get().projects.find((p) => p.id === id);
      if (!target) return;
      const next = get().projects.map((p) =>
        p.id === id ? { ...p, ...input } : p,
      );
      await optimistic(next, () => patchProject(id, input));
    },

    deleteProject: async (id) => {
      const next = get().projects.filter((p) => p.id !== id);
      await optimistic(next, () => apiDelete(id));
    },
  };
});

export function useEnsureProjectsLoaded() {
  const status = useProjectStore((s) => s.status);
  const load = useProjectStore((s) => s.load);
  useEffect(() => {
    if (status === "idle") load();
  }, [status, load]);
}
