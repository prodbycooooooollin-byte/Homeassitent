import { WifiOff, Loader2 } from "lucide-react";
import type { ConnectionStatus } from "@/lib/hooks/use-room-realtime";

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === "connected") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning"
    >
      {status === "disconnected" ? <WifiOff className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      {status === "disconnected" ? "Echtzeitverbindung unterbrochen – versuche erneut zu verbinden …" : "Verbinde …"}
    </div>
  );
}
