import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "Registrieren" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const userCount = await prisma.user.count();

  return (
    <AuthCard
      title="Konto erstellen"
      subtitle="Für die Freundesgruppe auf eurem Minecraft-Server."
      footer={
        <>
          Bereits registriert?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Anmelden
          </Link>
        </>
      }
    >
      <RegisterForm isFirstAccount={userCount === 0} />
    </AuthCard>
  );
}
