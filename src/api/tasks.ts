import type { CreateTaskInput, Status, Subtask, Task, UpdateSubtaskInput, UpdateTaskInput } from "@shared/types";
import { apiGet, apiRequest } from "./http";

export async function fetchTasks(status?: Status): Promise<Task[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiGet<{ tasks: Task[] }>(`/api/tasks${qs}`);
  return data.tasks;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const data = await apiRequest<{ task: Task }>("POST", "/api/tasks", input);
  return data.task;
}

export async function patchTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const data = await apiRequest<{ task: Task }>("PATCH", `/api/tasks/${id}`, input);
  return data.task;
}

export async function deleteTask(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("DELETE", `/api/tasks/${id}`);
}

export async function patchSubtask(id: string, input: UpdateSubtaskInput): Promise<Subtask> {
  const data = await apiRequest<{ subtask: Subtask }>("PATCH", `/api/subtasks/${id}`, input);
  return data.subtask;
}
