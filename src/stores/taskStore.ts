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
  tasks: Task[];
  load: () => Promise<void>;
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

  return {
    status: "idle",
    error: null,
    tasks: [],
    load: async () => {
      if (get().status === "loading") return;
      set({ status: "loading", error: null });
      try {
        const tasks = await fetchTasks();
        set({ status: "ready", tasks });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },
    reset: () => set({ status: "idle", error: null, tasks: [] }),

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

export function useEnsureTasksLoaded() {
  const status = useTaskStore((s) => s.status);
  const load = useTaskStore((s) => s.load);
  useEffect(() => {
    if (status === "idle") load();
  }, [status, load]);
}
