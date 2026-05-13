import { useEffect } from "react";
import { create } from "zustand";
import type { CreateTaskInput, Priority, Status, Task } from "@shared/types";
import { createTask as apiCreateTask, fetchTasks, patchSubtask, patchTask } from "../api/tasks";
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
  toggleDone: (taskId: string) => Promise<void>;
  setTitle: (taskId: string, title: string) => Promise<void>;
  cyclePriority: (taskId: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
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
      const next = get().tasks.map((t) =>
        t.id === taskId ? { ...t, status: nextStatus } : t,
      );
      await optimistic(next, () => patchTask(taskId, { status: nextStatus }));
    },

    setTitle: async (taskId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target || target.title === trimmed) return;
      const next = get().tasks.map((t) =>
        t.id === taskId ? { ...t, title: trimmed } : t,
      );
      await optimistic(next, () => patchTask(taskId, { title: trimmed }));
    },

    cyclePriority: async (taskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextPriority = PRIORITY_CYCLE[target.priority];
      const next = get().tasks.map((t) =>
        t.id === taskId ? { ...t, priority: nextPriority } : t,
      );
      await optimistic(next, () => patchTask(taskId, { priority: nextPriority }));
    },

    toggleSubtask: async (taskId, subtaskId) => {
      const target = get().tasks.find((t) => t.id === taskId);
      const sub = target?.subtasks.find((s) => s.id === subtaskId);
      if (!target || !sub) return;
      const nextDone = !sub.done;
      const next = get().tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: t.subtasks.map((s) =>
                s.id === subtaskId ? { ...s, done: nextDone } : s,
              ),
            }
          : t,
      );
      await optimistic(next, () => patchSubtask(subtaskId, { done: nextDone }));
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
