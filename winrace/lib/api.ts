import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function jsonOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Parst und validiert einen JSON-Body; wirft eine ApiError(400, ...) bei ungültiger Eingabe. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Ungültiger Anfrage-Body (kein gültiges JSON).");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Ungültige Eingabe.");
  }
  return result.data;
}

/** Wrappt einen Route-Handler und übersetzt ApiError einheitlich in eine JSON-Antwort. */
export function withApiErrors(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler().catch((err) => {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.message);
    }
    console.error("[api] Unerwarteter Fehler:", err);
    return jsonError(500, "Interner Serverfehler.");
  });
}
