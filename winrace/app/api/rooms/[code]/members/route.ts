import { jsonOk, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageMembers } from "@/lib/server/permissions";
import { listMembers } from "@/lib/server/members";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await requireActiveMember(params.code);
    const all = await listMembers(room.id);
    const canSeeAll = canManageMembers(member);

    return jsonOk({
      members: all
        .filter((m) => canSeeAll || m.status === "ACTIVE")
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          isTeamLead: m.isTeamLead,
          status: m.status,
          teamId: m.teamId,
          teamSide: m.team?.side ?? null,
          twitchLogin: m.twitchLoginOverride,
          joinedAt: m.joinedAt,
        })),
    });
  });
}
