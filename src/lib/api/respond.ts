/**
 * Shared API envelope helpers (docs/05): every route returns
 * { ok: true, data } or { ok: false, error: { code, message } }.
 */

import { NextResponse } from "next/server";

export function apiOk<T>(data: T, headers?: Record<string, string>) {
  return NextResponse.json(
    { ok: true as const, data },
    { headers },
  );
}

export function apiErr(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: { code, message } },
    { status },
  );
}
