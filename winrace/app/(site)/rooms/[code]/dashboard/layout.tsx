import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { serialize, type RoomStateView } from "@/lib/types";
import { RoomStateProvider } from "@/lib/client/room-state-context";
import { DashboardChrome } from "@/components/rooms/dashboard-chrome";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children, params }: { children: React.ReactNode; params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/rooms/${params.code}/dashboard`);

  const state = await getRoomState(params.code, user.id);
  if (!state) notFound();
  if (!state.viewer.member || state.viewer.member.status !== "ACTIVE") {
    redirect(`/rooms/${params.code}/lobby`);
  }

  return (
    <RoomStateProvider code={params.code} currentUserId={user.id} initialState={serialize(state) as RoomStateView}>
      <DashboardChrome>{children}</DashboardChrome>
    </RoomStateProvider>
  );
}
