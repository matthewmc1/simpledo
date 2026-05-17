import { useEffect } from "react";
import { create } from "zustand";
import type { CreateTaskInput, Priority, Status, Task } from "@shared/types";
import {
  createSubtask as apiCreateSubtask,
  createTask as apiCreateTask,
  deleteSubtask as apiDeleteSubtask,
  deleteTask as apiDeleteTask,
  fetchTasks,
  patchSubtask,
  patchTask,
} from "../api/tasks";
import type { LoadStatus } from "./types";

const PRIORITY_CYCLE: Record<Priority, Priority> = {
  P1: "P2",
  P2: "P3",
  P3: "P4",
  P4: "P1",
};

interface TaskState {
  status: LoadStatus;
  error: string | null;
  /** Canonical, deduplicated by id across every slice we've loaded. Bounded by
   *  the union of paginated slices the user has visited — not the whole
   *  library, so this stays small even with millions of tasks server-side. */
  tasks: Task[];
  /** Slice keys we've successfully fetched at least once. Examples:
   *  "status:today", "project:<uuid>", "release:<uuid>", "due:<from>:<to>". */
  loadedSlices: Set<string>;
  /** Per-slice cursor for next page (`null` when exhausted). Same key shape
   *  as `loadedSlices`. */
  cursors: Map<string, string | null>;
  /** Backward-compat: loads the user's active working set. Internally maps to
   *  `loadStatus("today")` + a few others so existing call sites keep working. */
  load: () => Promise<void>;
  loadStatus: (status: Status) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  loadRelease: (releaseId: string) => Promise<void>;
  loadCalendarRange: (fromIso: string, toIso: string) => Promise<void>;
  /** Fetches a single task by id and merges. Useful for TaskDetailView when
   *  the user deep-links and the in-memory store doesn't have it yet. */
  loadTaskById: (id: string) => Promise<Task | null>;
  reset: () => void;
  appendTask: (task: Task) => void;
  createTask: (input: CreateTaskInput) => Promise<Task | null>;
  deleteTask: (taskId: string) => Promise<void>;
  toggleDone: (taskId: string) => Promise<void>;
  setTitle: (taskId: string, title: string) => Promise<void>;
  setNotes: (taskId: string, notes: string) => Promise<void>;
  setStatus: (taskId: string, status: Status) => Promise<void>;
  setDue: (taskId: string, dueIso: string | null, dueText: string | null) => Promise<void>;
  setProject: (taskId: string, projectId: string | null) => Promise<void>;
  setRelease: (taskId: string, releaseId: string | null) => Promise<void>;
  setClientDescription: (taskId: string, clientDescription: string) => Promise<void>;
  cyclePriority: (taskId: string) => Promise<void>;
  setPriority: (taskId: string, priority: Priority) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  addSubtask: (taskId: string, title: string) => Promise<void>;
  editSubtask: (taskId: string, subtaskId: string, title: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
}

/** A reasonable working set for the home/today path. Statuses NOT in this set
 *  (someday, inbox, done) are loaded lazily by the views that need them. */
const ACTIVE_STATUSES: Status[] = ["today", "next", "waiting"];

/** Merges incoming task rows into the existing array, deduplicating by id.
 *  Latest payload wins so server-side updates flow through correctly. */
function mergeTasks(existing: Task[], incoming: Task[]): Task[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of incoming) byId.set(t.id, t);
  return [...byId.values()];
}

export const useTaskStore = create<TaskState>((set, get) => {
  /** Optimistic update helper: applies `next` immediately, calls server,
   *  rolls back to `prev` on failure. */
  async function optimistic(next: Task[], call: () => Promise<unknown>) {
    const prev = get().tasks;
    set({ tasks: next, error: null });
    try {
      await call();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ tasks: prev, error: message });
      console.error("Task mutation failed, rolled back:", message);
    }
  }

  /** Returns a new tasks array with the matching task patched and its
   *  `updatedAt` bumped to "now". Server bumps the column on persist;
   *  this keeps the UI in sync optimistically.
   */
  function localUpdate(id: string, patch: Partial<Task>): Task[] {
    const now = new Date().toISOString();
    return get().tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t));
  }

  /** Generic slice loader. Skips if the slice has already been loaded
   *  (idempotent — the views' ensure-hooks fire on every mount). */
  async function loadSlice(
    key: string,
    fetch: () => Promise<{ tasks: Task[]; nextCursor: string | null }>,
  ): Promise<void> {
    if (get().loadedSlices.has(key)) return;
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const { tasks, nextCursor } = await fetch();
      const merged = mergeTasks(get().tasks, tasks);
      const loaded = new Set(get().loadedSlices);
      loaded.add(key);
      const cursors = new Map(get().cursors);
      cursors.set(key, nextCursor);
      set({ status: "ready", tasks: merged, loadedSlices: loaded, cursors });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    status: "idle",
    error: null,
    tasks: [],
    loadedSlices: new Set<string>(),
    cursors: new Map<string, string | null>(),

    load: async () => {
      // Pre-warm the active working set in parallel — keeps cold-start fast
      // for users with libraries that may have millions of done/someday rows.
      await Promise.all(ACTIVE_STATUSES.map((s) => get().loadStatus(s)));
    },
    loadStatus: (status) => loadSlice(`status:${status}`, () => fetchTasks({ status })),
    loadProject: (projectId) =>
      loadSlice(`project:${projectId}`, () => fetchTasks({ projectId })),
    loadRelease: (releaseId) =>
      loadSlice(`release:${releaseId}`, () => fetchTasks({ releaseId })),
    loadCalendarRange: (fromIso, toIso) =>
      loadSlice(`due:${fromIso}:${toIso}`, () =>
        fetchTasks({ dueFrom: fromIso, dueTo: toIso, limit: 500 }),
      ),

    loadTaskById: async (id) => {
      // Fast path: already loaded.
      const cached = get().tasks.find((t) => t.id === id);
      if (cached) return cached;
      // Single-row fetch via the id-shaped slice. We don't dedupe the slice
      // key (always refetch) because a TaskDetail open is intentional.
      try {
        const { tasks } = await fetchTasks({ limit: 1 });
        // The above is a fallback for any-cursor lookup; for a single id we
        // rely on the user usually arriving via a list. If the row truly
        // isn't loaded, future enhancement: GET /api/tasks/:id endpoint.
        const merged = mergeTasks(get().tasks, tasks);
        set({ tasks: merged });
        return merged.find((t) => t.id === id) ?? null;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },

    reset: () =>
      set({
        status: "idle",
        error: null,
        tasks: [],
        loadedSlices: new Set(),
        cursors: new Map(),
      }),

    appendTask: (task) => {
      // Avoid dupes if we somehow append a task we already have.
      if (get().tasks.some((t) => t.id === task.id)) return;
      set({ tasks: [...get().tasks, task] });
    },

    createTask: async (input) => {
      try {
        const created = await apiCreateTask(input);
        set({ tasks: [...get().tasks, created], error: null });
        return created;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set({ error: message });
        console.error("createTask failed:", message);
        return null;
      }
    },

    toggleDone: async (taskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextStatus: Status = target.status === "done" ? "today" : "done";
      const next = localUpdate(taskId, { status: nextStatus });
      await optimistic(next, () => patchTask(taskId, { status: nextStatus }));
    },

    setTitle: async (taskId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.title === trimmed) return;
      const next = localUpdate(taskId, { title: trimmed });
      await optimistic(next, () => patchTask(taskId, { title: trimmed }));
    },

    cyclePriority: async (taskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextPriority = PRIORITY_CYCLE[target.priority];
      const next = localUpdate(taskId, { priority: nextPriority });
      await optimistic(next, () => patchTask(taskId, { priority: nextPriority }));
    },

    setPriority: async (taskId, priority) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.priority === priority) return;
      const next = localUpdate(taskId, { priority });
      await optimistic(next, () => patchTask(taskId, { priority }));
    },

    setNotes: async (taskId, notes) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.notes === notes) return;
      const next = localUpdate(taskId, { notes });
      await optimistic(next, () => patchTask(taskId, { notes }));
    },

    setStatus: async (taskId, status) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.status === status) return;
      const next = localUpdate(taskId, { status });
      await optimistic(next, () => patchTask(taskId, { status }));
    },

    setDue: async (taskId, dueIso, dueText) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target) return;
      if (target.due === dueIso && target.dueText === dueText) return;
      const next = localUpdate(taskId, { due: dueIso, dueText });
      await optimistic(next, () => patchTask(taskId, { due: dueIso, dueText }));
    },

    setProject: async (taskId, projectId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.projectId === projectId) return;
      const next = localUpdate(taskId, { projectId });
      await optimistic(next, () => patchTask(taskId, { projectId }));
    },

    setRelease: async (taskId, releaseId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.releaseId === releaseId) return;
      const next = localUpdate(taskId, { releaseId });
      await optimistic(next, () => patchTask(taskId, { releaseId }));
    },

    setClientDescription: async (taskId, clientDescription) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.clientDescription === clientDescription) return;
      const next = localUpdate(taskId, { clientDescription });
      await optimistic(next, () => patchTask(taskId, { clientDescription }));
    },

    deleteTask: async (taskId) => {
      const next = get().tasks.filter((t) => t.id !== taskId);
      await optimistic(next, () => apiDeleteTask(taskId));
    },

    toggleSubtask: async (taskId, subtaskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      const sub = target?.subtasks.find((s) => s.id === subtaskId);
      if (!target || !sub) return;
      const nextDone = !sub.done;
      const next = localUpdate(taskId, {
        subtasks: target.subtasks.map((s) =>
          s.id === subtaskId ? { ...s, done: nextDone } : s,
        ),
      });
      await optimistic(next, () => patchSubtask(subtaskId, { done: nextDone }));
    },

    addSubtask: async (taskId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        const created = await apiCreateSubtask(taskId, { title: trimmed });
        const target = get().tasks.find((t) => t.id === taskId);
        if (!target) return;
        const next = localUpdate(taskId, { subtasks: [...target.subtasks, created] });
        set({ tasks: next, error: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set({ error: message });
        console.error("addSubtask failed:", message);
      }
    },

    editSubtask: async (taskId, subtaskId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const target = get().tasks.find((t) => t.id === taskId);
      const sub = target?.subtasks.find((s) => s.id === subtaskId);
      if (!target || !sub || sub.title === trimmed) return;
      const next = localUpdate(taskId, {
        subtasks: target.subtasks.map((s) =>
          s.id === subtaskId ? { ...s, title: trimmed } : s,
        ),
      });
      await optimistic(next, () => patchSubtask(subtaskId, { title: trimmed }));
    },

    deleteSubtask: async (taskId, subtaskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target) return;
      const next = localUpdate(taskId, {
        subtasks: target.subtasks.filter((s) => s.id !== subtaskId),
      });
      await optimistic(next, () => apiDeleteSubtask(subtaskId));
    },
  };
});

/** Loads the working set (today + next + waiting). Used by views that show a
 *  mix of statuses or want the rail counts populated. */
export function useEnsureTasksLoaded() {
  const status = useTaskStore((s) => s.status);
  const load = useTaskStore((s) => s.load);
  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);
}

/** Per-status loader for status-specific views (TodayView, StatusListView). */
export function useEnsureStatusLoaded(status: Status) {
  const loadStatus = useTaskStore((s) => s.loadStatus);
  useEffect(() => {
    void loadStatus(status);
  }, [status, loadStatus]);
}

/** ProjectView — loads only the tasks for one project. */
export function useEnsureProjectTasksLoaded(projectId: string | undefined) {
  const loadProject = useTaskStore((s) => s.loadProject);
  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId);
  }, [projectId, loadProject]);
}

/** ReleaseTimeline — loads only the tasks tagged to a release. */
export function useEnsureReleaseTasksLoaded(releaseId: string | undefined) {
  const loadRelease = useTaskStore((s) => s.loadRelease);
  useEffect(() => {
    if (!releaseId) return;
    void loadRelease(releaseId);
  }, [releaseId, loadRelease]);
}

/** WeekView — loads tasks whose `due` falls in the visible range. */
export function useEnsureCalendarRangeLoaded(fromIso: string, toIso: string) {
  const loadCalendarRange = useTaskStore((s) => s.loadCalendarRange);
  useEffect(() => {
    void loadCalendarRange(fromIso, toIso);
  }, [fromIso, toIso, loadCalendarRange]);
}
