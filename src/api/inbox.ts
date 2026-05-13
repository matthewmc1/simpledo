import type {
  CaptureInput,
  InboxItem,
  ProcessInput,
  Task,
} from "@shared/types";
import { apiGet, apiRequest } from "./http";

export async function fetchInbox(): Promise<InboxItem[]> {
  const data = await apiGet<{ items: InboxItem[] }>("/api/inbox");
  return data.items;
}

export async function captureInbox(input: CaptureInput): Promise<InboxItem> {
  const data = await apiRequest<{ item: InboxItem }>("POST", "/api/inbox", input);
  return data.item;
}

export interface ProcessResult {
  task?: Task;
  deleted?: true;
}

export async function processInboxItem(
  id: string,
  input: ProcessInput,
): Promise<ProcessResult> {
  return apiRequest<ProcessResult>("POST", `/api/inbox/${id}/process`, input);
}

export async function deleteInboxItem(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("DELETE", `/api/inbox/${id}`);
}
