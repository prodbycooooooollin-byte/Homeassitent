import { Badge } from "@/components/ui/badge";
import type { DeviceStatus } from "@/lib/types";

const config: Record<DeviceStatus, { label: string; tone: "good" | "neutral" | "bad" }> = {
  active: { label: "Aktiv", tone: "good" },
  standby: { label: "Standby", tone: "neutral" },
  offline: { label: "Offline", tone: "neutral" },
  error: { label: "Fehler", tone: "bad" },
};

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const c = config[status];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}
