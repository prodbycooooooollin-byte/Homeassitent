import { FlaskConical, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

/** Muss auf JEDER Ansicht erscheinen, die Beispieldaten statt echter Serverdaten zeigt. */
export function DemoModeBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 text-xs text-gold">
      <FlaskConical size={14} />
      <span>
        <strong className="font-semibold">Demo-Modus:</strong> Diese Ansicht zeigt
        Beispieldaten, keine echten Serverdaten. Richte in den Einstellungen die
        Serververbindung ein, um echte Daten zu sehen.
      </span>
    </div>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="gold">
      <FlaskConical size={12} /> Demo
    </Badge>
  );
}

/** Für Werte, die bei unterbrochener Verbindung zuletzt bekannt sind. */
export function StaleDataNote({ asOf }: { asOf: Date | string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
      <WifiOff size={14} />
      <span>
        Keine aktuelle Verbindung - zuletzt bekannte Daten vom{" "}
        <strong className="font-semibold">{formatDateTime(asOf)}</strong>.
      </span>
    </div>
  );
}
