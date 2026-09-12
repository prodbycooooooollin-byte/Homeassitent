"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export interface AuthFormState {
  error?: string;
  values?: { email?: string; displayName?: string };
  /** Wird bei jedem Aufruf erhöht, damit die Formularfelder (siehe
   * key={state.attempt}) nach einem Fehler gezielt neu gemountet werden -
   * Next.js leert unkontrollierte Formularfelder standardmäßig nach jedem
   * Action-Aufruf, egal ob er erfolgreich war. */
  attempt: number;
}

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(32),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse."),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben.").max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse."),
  password: z.string().min(1, "Passwort erforderlich."),
});

async function sessionMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

export async function registerAction(
  prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const attempt = prev.attempt + 1;
  const rawDisplayName = String(formData.get("displayName") ?? "");
  const rawEmail = String(formData.get("email") ?? "");

  const parsed = registerSchema.safeParse({
    displayName: rawDisplayName,
    email: rawEmail,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      attempt,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
      values: { displayName: rawDisplayName, email: rawEmail },
    };
  }
  const { displayName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      attempt,
      error: "Für diese E-Mail-Adresse existiert bereits ein Konto.",
      values: { displayName, email },
    };
  }

  const userCount = await prisma.user.count();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      displayName,
      email,
      passwordHash,
      // Bootstrap: das allererste Konto auf einer frischen Instanz wird
      // automatisch Admin, damit die Serververbindung eingerichtet werden kann.
      role: userCount === 0 ? "ADMIN" : "MEMBER",
    },
  });

  await createSession(user.id, await sessionMeta());
  redirect("/");
}

export async function loginAction(
  prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const attempt = prev.attempt + 1;
  const rawEmail = String(formData.get("email") ?? "");

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      attempt,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
      values: { email: rawEmail },
    };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Bewusst dieselbe Fehlermeldung für "existiert nicht" und "falsches
  // Passwort", um keine Rückschlüsse auf registrierte E-Mail-Adressen zuzulassen.
  if (!user) {
    return { attempt, error: "E-Mail-Adresse oder Passwort ist falsch.", values: { email } };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { attempt, error: "E-Mail-Adresse oder Passwort ist falsch.", values: { email } };
  }

  await createSession(user.id, await sessionMeta());
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
