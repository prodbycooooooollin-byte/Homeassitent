import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import type { Role } from "@/lib/constants";

/**
 * Auth-Guard für Route Handler (app/api/**). Liefert entweder den Nutzer
 * oder eine fertige Fehler-Response - Aufrufer prüfen mit `"user" in result`.
 *
 *   const auth = await requireApiUser(["ADMIN"]);
 *   if (!("user" in auth)) return auth.response;
 *   const { user } = auth;
 */
export async function requireApiUser(
  roles?: Role[],
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role)) {
    return {
      response: NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 }),
    };
  }
  return { user };
}

/**
 * Leichte CSRF-Abwehr (defense in depth zusätzlich zu SameSite=Lax-Cookies):
 * mutierende Requests müssen von der eigenen Origin stammen.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // z. B. server-zu-server/curl ohne Origin-Header
  const host = req.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      return NextResponse.json({ error: "Ungültige Origin." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Ungültige Origin." }, { status: 403 });
  }
  return null;
}
