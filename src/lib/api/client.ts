/**
 * Typed fetch wrapper for our API envelope: { ok, data } | { ok:false, error }.
 * Throws ApiError on !ok so React Query error states work naturally.
 */

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!res.ok || !body || body.ok === false) {
    throw new ApiError(
      res.status,
      body && "error" in body ? body.error.code : "HTTP_ERROR",
      body && "error" in body ? body.error.message : `HTTP ${res.status}`,
    );
  }
  return body.data;
}
