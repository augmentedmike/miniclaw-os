import { NextResponse } from "next/server";

/**
 * Return a JSON success response.
 * @param data - optional payload to include in the response body
 * @param status - HTTP status code (default 200)
 */
export function apiOk(data?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/**
 * Return a JSON error response.
 * @param message - human-readable error message
 * @param status - HTTP status code (default 400)
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
