import type {
  CreateReleaseInput,
  Release,
  UpdateReleaseInput,
} from "@shared/types";
import { apiGet, apiRequest } from "./http";

export async function fetchReleases(projectId: string): Promise<Release[]> {
  const data = await apiGet<{ releases: Release[] }>(
    `/api/projects/${projectId}/releases`,
  );
  return data.releases;
}

export async function createRelease(
  projectId: string,
  input: CreateReleaseInput,
): Promise<Release> {
  const data = await apiRequest<{ release: Release }>(
    "POST",
    `/api/projects/${projectId}/releases`,
    input,
  );
  return data.release;
}

export async function patchRelease(
  id: string,
  input: UpdateReleaseInput,
): Promise<Release> {
  const data = await apiRequest<{ release: Release }>(
    "PATCH",
    `/api/releases/${id}`,
    input,
  );
  return data.release;
}

export async function deleteRelease(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("DELETE", `/api/releases/${id}`);
}

export async function fetchChangelog(
  releaseId: string,
): Promise<{ release: Release; markdown: string }> {
  return apiGet<{ release: Release; markdown: string }>(
    `/api/releases/${releaseId}/changelog`,
  );
}

export interface ReleaseDetailTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  releaseId: string | null;
  previousReleaseId: string | null;
  clientDescription: string;
  kind: "feature" | "bug" | "chore";
  isRegression: boolean;
  regressionOfReleaseId: string | null;
  dueText: string | null;
  updatedAt: string;
}

export interface ReleaseDetail {
  release: Release;
  tasks: ReleaseDetailTask[];
  movedOut: ReleaseDetailTask[];
  /** Bugs filed later whose `regressionOfReleaseId` points at this release. */
  regressions: ReleaseDetailTask[];
}

export async function fetchRelease(releaseId: string): Promise<ReleaseDetail> {
  return apiGet<ReleaseDetail>(`/api/releases/${releaseId}`);
}
