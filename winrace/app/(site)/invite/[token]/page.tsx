import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvitePreview } from "@/lib/server/rooms";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { InviteJoinButton } from "@/components/rooms/invite-join-button";
import { Swords } from "lucide-react";

export const metadata: Metadata = { title: "Einladung" };

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getInvitePreview(params.token);
  if (!invite) notFound();

  return (
    <div className="bg-grid-fade flex min-h-dvh flex-col items-center justify-center bg-grid px-4 py-12">
      <div className="mb-8 flex items-center gap-2 text-ink">
        <Swords className="h-6 w-6 text-brand" />
        <span className="font-display text-xl font-bold tracking-wide">WinRace</span>
      </div>

      <Card className="w-full max-w-sm p-2">
        <CardContent className="space-y-5 pt-5 text-center">
          <Avatar name={invite.room.name} src={invite.room.logoUrl} size="lg" className="mx-auto" />
          <div>
            <h1 className="font-display text-xl font-bold text-ink">{invite.room.name}</h1>
            <p className="mt-1 text-sm text-ink-faint">Gehostet von {invite.room.hostName}</p>
          </div>

          <div className="flex justify-center gap-3">
            {invite.room.teams.map((t) => (
              <div key={t.side} className="flex-1 rounded-xl border border-base-border p-3">
                <div className="mx-auto h-2 w-8 rounded-full" style={{ background: t.color }} />
                <p className="mt-2 text-sm font-medium text-ink">{t.name}</p>
                <p className="text-xs text-ink-faint">
                  {t.memberCount}/{invite.room.maxMembersPerTeam} Plätze
                </p>
              </div>
            ))}
          </div>

          {invite.valid ? (
            <InviteJoinButton token={params.token} code={invite.room.code} />
          ) : (
            <p className="text-sm text-danger">Diese Einladung ist nicht mehr gültig. Bitte frage den Host nach einem neuen Link.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
