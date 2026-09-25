import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import type { SecurityEntity } from "@/lib/types";

const KIND_ICON: Record<SecurityEntity["kind"], string> = {
  contact: "door-closed",
  motion: "activity",
  smoke: "siren",
  water: "droplet",
  camera: "camera",
};

const STATE_LABEL: Record<SecurityEntity["state"], string> = {
  clear: "Geschlossen",
  open: "Geöffnet",
  detected: "Bewegung erkannt",
  alert: "Alarm",
  online: "Online",
  offline: "Offline",
};

function stateTone(state: SecurityEntity["state"]): "good" | "warn" | "bad" | "neutral" {
  if (state === "alert") return "bad";
  if (state === "open" || state === "detected") return "warn";
  if (state === "offline") return "neutral";
  return "good";
}

export function SecurityEntityRow({ entity }: { entity: SecurityEntity }) {
  const icon = entity.kind === "contact" && entity.state === "open" ? "door-open" : KIND_ICON[entity.kind];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{entity.name}</p>
        <p className="truncate text-[0.7rem] text-ink-faint">{formatRelativeTime(entity.lastChanged)}</p>
      </div>
      <Badge tone={stateTone(entity.state)}>{STATE_LABEL[entity.state]}</Badge>
    </div>
  );
}
