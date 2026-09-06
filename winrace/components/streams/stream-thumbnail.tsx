import { Radio, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { TwitchStreamStatus } from "@/lib/hooks/use-twitch-live-status";
import type { TeamSide } from "@/lib/types";

export interface StreamerInfo {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  twitchLogin: string;
  teamColor: string;
  teamSide: TeamSide;
}

export function StreamThumbnail({
  streamer,
  status,
  active,
  onClick,
}: {
  streamer: StreamerInfo;
  status: TwitchStreamStatus | undefined;
  active: boolean;
  onClick: () => void;
}) {
  const isLive = status?.isLive ?? false;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-all sm:w-44",
        active ? "border-2" : "border-base-border hover:border-base-border-strong"
      )}
      style={active ? { borderColor: streamer.teamColor } : undefined}
    >
      <div className="relative aspect-video w-full bg-base-raised">
        {isLive && status?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={status.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-6 w-6 text-ink-faint" />
          </div>
        )}
        <span
          className={cn(
            "absolute left-1.5 top-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
            isLive ? "bg-danger text-white" : "bg-black/60 text-white/60"
          )}
        >
          {isLive && <Radio className="h-2.5 w-2.5" />}
          {isLive ? "Live" : "Offline"}
        </span>
        {isLive && status?.viewerCount !== undefined && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{status.viewerCount}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-2">
        <Avatar name={streamer.displayName} src={streamer.avatarUrl} size="xs" />
        <span className="truncate text-xs font-medium text-ink">{streamer.displayName}</span>
      </div>
    </button>
  );
}
