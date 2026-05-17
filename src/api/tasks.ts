import type {
  CreateSubtaskInput,
  CreateTaskInput,
  Status,
  Subtask,
  Task,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from "@shared/types";
import { apiGet, apiRequest } from "./http";

export interface FetchTasksQuery {
  status?: Status;
  projectId?: string | null;
  releaseId?: string | null;
  dueFrom?: string;
  dueTo?: string;
  limit?: number;
  cursor?: string;
}

export interface FetchTasksResult {
  tasks: Task[];
  /** ISO timestamp of the next page's starting `createdAt`, or `null` when
   *  the current page is the last one. */
  nextCursor: string | null;
}

export interface SearchHit {
  id: string;
  title: string;
  status: Status;
  priority: string;
  projectId: string | null;
  dueText: string | null;
  rank: number;
}

export async function searchTasks(q: string): Promise<SearchHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const data = await apiGet<{ tasks: SearchHit[] }>(
    `/api/tasks/search?q=${encodeURIComponent(trimmed)}`,
  );
  return data.tasks;
}

export async function fetchTasks(query: FetchTasksQuery = {}): Promise<FetchTasksResult> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  // `null` is a valid value (filter to "tasks with no project"). The server
  // distinguishes missing vs explicit null via Zod nullable+optional.
  if (query.projectId !== undefined) params.set("projectId", query.projectId ?? "");
  if (query.releaseId !== undefined) params.set("releaseId", query.releaseId ?? "");
  if (query.dueFrom) params.set("dueFrom", query.dueFrom);
  if (query.dueTo) params.set("dueTo", query.dueTo);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return apiGet<FetchTasksResult>(`/api/tasks${qs ? `?${qs}` : ""}`);
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

export async function createSubtask(taskId: string, input: CreateSubtaskInput): Promise<Subtask> {
  const data = await apiRequest<{ subtask: Subtask }>(
    "POST",
    `/api/tasks/${taskId}/subtasks`,
    input,
  );
  return data.subtask;
}

export async function deleteSubtask(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("DELETE", `/api/subtasks/${id}`);
}
