import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { serialize, type RoomStateView } from "@/lib/types";
import { LobbyView } from "@/components/rooms/lobby-view";

export const metadata: Metadata = { title: "Lobby" };
export const dynamic = "force-dynamic";

export default async function LobbyPage({ params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/rooms/${params.code}/lobby`);

  const state = await getRoomState(params.code, user.id);
  if (!state) notFound();

  if (!state.viewer.member) {
    redirect(`/rooms/join?code=${params.code}`);
  }

  return <LobbyView code={params.code} initialState={serialize(state) as RoomStateView} currentUserId={user.id} />;
}
