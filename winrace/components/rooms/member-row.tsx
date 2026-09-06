import { Crown, Tv } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ROOM_ROLE_LABELS } from "@/lib/labels";

export interface MemberRowData {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  isTeamLead: boolean;
  status: string;
  twitchLogin: string | null;
}

export function MemberRow({ member, online, action }: { member: MemberRowData; online: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <div className="relative shrink-0">
        <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-base-card",
            online ? "bg-success" : "bg-ink-faint"
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">{member.displayName}</p>
          {member.isTeamLead && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Team-Lead" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <span>{online ? "Online" : "Offline"}</span>
          {member.status === "PENDING" && <span className="text-warning">· Wartet auf Bestätigung</span>}
          {member.twitchLogin && (
            <a
              href={`https://twitch.tv/${member.twitchLogin}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[#a970ff] hover:underline"
            >
              <Tv className="h-3 w-3" /> {member.twitchLogin}
            </a>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function RoleBadgeText(role: string) {
  return ROOM_ROLE_LABELS[role] ?? role;
}
