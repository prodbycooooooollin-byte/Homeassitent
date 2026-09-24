import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { clockTime } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import type { Activity } from "../lib/types";
import { EmptyState } from "./ui";

export function ActivityLog({ items, limit = 12 }: { items: Activity[]; limit?: number }) {
  if (!items.length) return <EmptyState title={t("act.empty")} />;
  return (
    <ol className="activity" style={{ listStyle: "none", margin: 0, padding: "4px 0 10px" }} aria-live="polite">
      {items.slice(0, limit).map((a) => {
        const Icon = a.level === "success" ? CheckCircle2 : a.level === "warn" ? AlertTriangle : a.level === "error" ? XCircle : Circle;
        return (
          <li key={a.id} className={`act ${a.level}`}>
            <Icon size={14} className="ic" aria-hidden="true" />
            <span>{a.message}</span>
            <time dateTime={new Date(a.ts).toISOString()}>{clockTime(a.ts, getLang())}</time>
          </li>
        );
      })}
    </ol>
  );
}
