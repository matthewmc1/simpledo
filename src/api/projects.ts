import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@shared/types";
import { apiGet, apiRequest } from "./http";

export async function fetchProjects(): Promise<Project[]> {
  const data = await apiGet<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const data = await apiRequest<{ project: Project }>("POST", "/api/projects", input);
  return data.project;
}

export async function patchProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const data = await apiRequest<{ project: Project }>(
    "PATCH",
    `/api/projects/${id}`,
    input,
  );
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("DELETE", `/api/projects/${id}`);
}
