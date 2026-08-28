"use client";

/** Small fetch wrapper for client components. Surfaces the API's message as-is. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; details?: Record<string, string[]> };

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  try {
    const response = await fetch(path, {
      ...rest,
      method: rest.method ?? (json ? "POST" : "GET"),
      headers: {
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json ? JSON.stringify(json) : rest.body,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        message: payload?.error?.message ?? "That did not go through. Try again.",
        details: payload?.error?.details,
      };
    }
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, message: "No connection. Check your network and try again." };
  }
}
