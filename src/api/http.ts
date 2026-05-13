export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiPost<T, B = unknown>(path: string, body?: B): Promise<T> {
  return apiRequest<T, B>("POST", path, body);
}

export async function apiRequest<T, B = unknown>(
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  path: string,
  body?: B,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}
