import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, SESSION_DURATION_DAYS, type Role } from "@/lib/constants";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Legt eine neue DB-Session an und setzt das httpOnly-Cookie. Der Rohwert
 * des Tokens verlässt den Server nie außer im Cookie selbst - in der DB wird
 * nur der SHA-256-Hash gespeichert, damit ein DB-Leak keine gültigen
 * Sitzungen preisgibt.
 */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // "Secure"-Cookies werden von Browsern nur über HTTPS akzeptiert. Für
    // reinen LAN-Zugriff ohne HTTPS (z. B. http://192.168.x.x:3000 im
    // Heimnetz) ALLOW_INSECURE_COOKIES=true setzen - sonst schlägt das
    // Login dort sonst ohne erkennbare Fehlermeldung fehl, weil der Browser
    // das Cookie verwirft. Produktion mit echter Domain: unverändert lassen.
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Ermittelt den eingeloggten Nutzer für die aktuelle Anfrage. `cache()`
 * dedupliziert den DB-Zugriff, falls mehrere Server-Components pro Request
 * danach fragen.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role as Role,
    createdAt: session.user.createdAt,
  };
});

/** Für Server Components/Pages: leitet nicht eingeloggte Nutzer zum Login um. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Wie requireUser(), aber zusätzlich mit Rollenprüfung (z. B. nur Admins). */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/?error=forbidden");
  return user;
}
