import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Anmelden" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <AuthCard
      title="Willkommen zurück"
      subtitle="Melde dich mit deinem Craftboard-Konto an."
      footer={
        <>
          Noch kein Konto?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Registrieren
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
