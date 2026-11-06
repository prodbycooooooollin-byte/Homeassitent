import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { useState } from "react";
import { clockTime } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import type { Activity } from "../lib/types";
import { Dialog, EmptyState } from "./ui";

type Group = { a: Activity; count: number };

/** Aufeinanderfolgende gleiche Einträge zusammenfassen (die vollständige Liste bleibt erhalten). */
export function groupActivity(items: Activity[]): Group[] {
  const out: Group[] = [];
  for (const a of items) {
    const last = out[out.length - 1];
    if (last && last.a.kind === a.kind && last.a.message === a.message) last.count += 1;
    else out.push({ a, count: 1 });
  }
  return out;
}

function Rows({ groups }: { groups: Group[] }) {
  return (
    <ol className="activity" style={{ listStyle: "none", margin: 0, padding: "4px 0 10px" }} aria-live="polite">
      {groups.map(({ a, count }) => {
        const Icon = a.level === "success" ? CheckCircle2 : a.level === "warn" ? AlertTriangle : a.level === "error" ? XCircle : Circle;
        return (
          <li key={a.id} className={`act ${a.level}`}>
            <Icon size={14} className="ic" aria-hidden="true" />
            <span>
              {a.message}
              {count > 1 && <span className="badge times">{t("act.repeated", { n: count })}</span>}
            </span>
            <time dateTime={new Date(a.ts).toISOString()}>{clockTime(a.ts, getLang())}</time>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityLog({ items, limit = 5, title }: { items: Activity[]; limit?: number; title?: string }) {
  const [all, setAll] = useState(false);
  const groups = groupActivity(items);
  if (!groups.length) return <EmptyState title={t("act.empty")} />;
  return (
    <>
      <Rows groups={groups.slice(0, limit)} />
      {groups.length > limit && (
        <div style={{ padding: "0 20px 14px" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>{t("act.all")}</button>
        </div>
      )}
      {all && (
        <Dialog title={title ?? t("act.title")} onClose={() => setAll(false)} wide>
          <Rows groups={groups} />
        </Dialog>
      )}
    </>
  );
}
