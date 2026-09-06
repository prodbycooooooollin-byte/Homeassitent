import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { serialize, type RoomStateView } from "@/lib/types";
import { StreamCenterView } from "@/components/streams/stream-center-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const state = await getRoomState(params.code, null);
  return { title: state ? `${state.room.name} · Streams` : "Stream-Zentrale" };
}

export default async function StreamsPage({ params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  const state = await getRoomState(params.code, user?.id ?? null);
  if (!state) notFound();

  if (!state.canSeeFullDetails) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <Lock className="h-10 w-10 text-ink-faint" />
        <h1 className="font-display text-xl font-bold text-ink">Dieser Raum ist privat</h1>
        <Link href={`/rooms/join?code=${params.code}`}>
          <Button>Raum beitreten</Button>
        </Link>
      </div>
    );
  }

  return <StreamCenterView code={params.code} initialState={serialize(state) as RoomStateView} currentUserId={user?.id ?? null} />;
}
