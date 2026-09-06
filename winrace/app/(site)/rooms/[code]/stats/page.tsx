import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { StatsView } from "@/components/rooms/stats-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const state = await getRoomState(params.code, null);
  return { title: state ? `${state.room.name} · Statistiken` : "Statistiken" };
}

export default async function RoomStatsPage({ params }: { params: { code: string } }) {
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Link href={`/rooms/${params.code}/live`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Zur Live-Ansicht
      </Link>
      <h1 className="mb-6 font-display text-2xl font-bold text-ink">Statistiken · {state.room.name}</h1>
      <StatsView code={params.code} />
    </div>
  );
}
