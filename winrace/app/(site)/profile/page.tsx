import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/layout/site-header";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata: Metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/profile");

  const [fullUser, twitchConnection] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.twitchConnection.findUnique({ where: { userId: user.id } }),
  ]);
  if (!fullUser) redirect("/login");

  return (
    <div>
      <SiteHeader />
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <h1 className="font-display text-2xl font-bold text-ink">Dein Profil</h1>
        <p className="mt-1 text-ink-faint">Anzeigename, Profilbild, Benachrichtigungen und Twitch-Verknüpfung.</p>
        <div className="mt-8">
          <ProfileForm
            user={{
              displayName: fullUser.displayName,
              email: fullUser.email,
              avatarUrl: fullUser.avatarUrl,
              soundEnabled: fullUser.soundEnabled,
              reduceMotion: fullUser.reduceMotion,
            }}
            twitchLogin={twitchConnection?.twitchLogin ?? null}
            twitchVerified={twitchConnection?.verified ?? false}
          />
        </div>
      </div>
    </div>
  );
}
