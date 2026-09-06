import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { serialize, type RoomStateView } from "@/lib/types";
import { LiveOverviewView } from "@/components/rooms/live-overview-view";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const state = await getRoomState(params.code, null);
  return { title: state ? `${state.room.name} · Live` : "Live-Ansicht" };
}

export default async function LiveOverviewPage({ params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  const state = await getRoomState(params.code, user?.id ?? null);
  if (!state) notFound();

  if (!state.canSeeFullDetails) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <Lock className="h-10 w-10 text-ink-faint" />
        <h1 className="font-display text-xl font-bold text-ink">Dieser Raum ist privat</h1>
        <p className="max-w-sm text-sm text-ink-faint">
          Der Host hat die Zuschaueransicht auf Mitglieder beschränkt. Bitte tritt dem Raum bei, um live mitzuverfolgen.
        </p>
        <Link href={`/rooms/join?code=${params.code}`}>
          <Button>Raum beitreten</Button>
        </Link>
      </div>
    );
  }

  return <LiveOverviewView code={params.code} initialState={serialize(state) as RoomStateView} currentUserId={user?.id ?? null} />;
}
