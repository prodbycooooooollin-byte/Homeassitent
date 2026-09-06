import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { isTwitchLoginEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Willkommen zurück"
      subtitle="Melde dich an, um deine Räume zu verwalten."
      footer={
        <>
          Noch kein Konto?{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            Jetzt registrieren
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm twitchEnabled={isTwitchLoginEnabled} />
      </Suspense>
    </AuthShell>
  );
}
