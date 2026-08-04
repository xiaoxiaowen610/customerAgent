import { readSession } from "./session";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5050/api";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function authHeaders() {
  const session = readSession();
  return {
    "Content-Type": "application/json",
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {})
  };
}
