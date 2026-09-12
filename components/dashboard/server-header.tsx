import { LiveDot } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { formatRelativeTime } from "@/lib/format";

export function ServerHeader({
  name,
  host,
  port,
  online,
  motd,
  asOf,
}: {
  name: string;
  host: string;
  port: number;
  online: boolean;
  motd: string | null;
  asOf: Date | null;
}) {
  const address = port === 25565 ? host : `${host}:${port}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <LiveDot online={online} />
          <h1 className="text-xl font-semibold text-ink">{name}</h1>
          <span className={online ? "text-sm text-accent" : "text-sm text-ink-faint"}>
            {online ? "Online" : "Offline"}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {motd || "Keine MOTD verfügbar"}
          {asOf && <span className="text-ink-faint"> · Stand {formatRelativeTime(asOf)}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink">
          {address}
        </code>
        <CopyButton value={address} label="Adresse kopieren" />
      </div>
    </div>
  );
}
