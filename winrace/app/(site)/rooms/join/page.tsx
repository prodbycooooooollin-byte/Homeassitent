import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { JoinRoomForm } from "@/components/rooms/join-room-form";
import { SiteHeader } from "@/components/layout/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CHALLENGE_STATUS_COLORS, CHALLENGE_STATUS_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Raum beitreten" };
export const dynamic = "force-dynamic";

export default async function JoinRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/rooms/join");

  const memberships = await prisma.roomMember.findMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] }, room: { isArchived: false } },
    include: { room: { include: { challenge: true } } },
    orderBy: { joinedAt: "desc" },
  });

  return (
    <div>
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-14">
        {memberships.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Deine aktiven Räume</h2>
            <div className="space-y-2">
              {memberships.map((m) => (
                <Link key={m.id} href={m.role === "HOST" ? `/rooms/${m.room.code}/dashboard` : `/rooms/${m.room.code}/lobby`}>
                  <Card className="transition-colors hover:bg-base-card-hover">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.room.name} src={m.room.logoUrl} size="sm" />
                        <span className="text-sm font-medium text-ink">{m.room.name}</span>
                      </div>
                      <Badge className={CHALLENGE_STATUS_COLORS[m.room.challenge?.status ?? "LOBBY"]}>
                        {CHALLENGE_STATUS_LABELS[m.room.challenge?.status ?? "LOBBY"]}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-ink">Raum beitreten</h1>
          <Link href="/rooms/new">
            <Button variant="ghost" size="sm">
              <Plus className="h-4 w-4" /> Neu
            </Button>
          </Link>
        </div>
        <p className="mt-2 text-ink-faint">Gib den Raumcode und das Passwort ein, das dir der Host mitgeteilt hat.</p>
        <div className="mt-8">
          <Suspense>
            <JoinRoomForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
