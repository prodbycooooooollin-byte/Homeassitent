import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Registrieren" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Konto erstellen"
      subtitle="Erstelle Räume, tritt Teams bei und verfolge deine Challenges live."
      footer={
        <>
          Bereits registriert?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Zum Login
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
