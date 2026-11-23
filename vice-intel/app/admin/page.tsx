import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import { Panel } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getAll, getIssues, hrefFor, statusCounts } from "@/lib/content/repository";
import { VERIFICATION_STATUSES } from "@/lib/content/schema";
import { KIND_META } from "@/lib/ui-meta";
import { CopyBlock } from "@/components/lists/CopyBlock";

export const metadata: Metadata = { title: "Content desk", robots: { index: false, follow: false } };

const TEMPLATE = `{
  id: "unlock:example-item",          // <kind>:<slug>
  kind: "unlock",
  slug: "example-item",
  title: "Example Item",
  aliases: ["other name"],
  summary: "One or two sentences players can scan.",
  category: "vehicle",
  howTo: "One-line answer to “how do I unlock this?”",
  requirements: [{ label: "Complete “Mission”", ref: "mission:slug", kind: "mission" }],
  verification: { status: "verified", checkedAt: "2026-11-22", note: "Reproduced on PS5 v1.01" },
  sources: ["source-id"],             // must exist in content/sources.ts
  media: [{
    id: "example-hero",
    alt: "Describe the image for screen readers",
    src: "/media/example.webp",       // licensed image — or art: { scene, seed }
    attribution: { label: "Captured by …", license: "Used with permission" },
    authenticGameplay: true
  }],
  locationId: "location:vice-city",
  mapPoint: { x: 740, y: 660, precision: "approximate" },
  related: ["mission:slug"],
  updatedAt: "2026-11-22"
}`;

export default function AdminPage() {
  const issues = getIssues();
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const counts = statusCounts();
  const records = [...getAll()].sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  return (
    <div className="container-page pt-8">
      <p className="eyebrow">Internal</p>
      <h1 className="h-display mt-1 flex items-center gap-3 text-3xl">
        <Database className="h-7 w-7 text-violet-400" /> Content desk
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Records live as typed, schema-validated files in <code className="rounded bg-white/5 px-1">/content</code>. Edit or add a record, run{" "}
        <code className="rounded bg-white/5 px-1">npm run content:check</code>, open a pull request — search, the map and the AI pick it up automatically. No code changes required.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="text-xs text-fg-faint">Records</p>
          <p className="font-display text-3xl font-semibold">{records.length}</p>
        </div>
        <div className="surface p-4">
          <p className="flex items-center gap-1 text-xs text-fg-faint"><AlertOctagon className="h-3.5 w-3.5" /> Errors</p>
          <p className={`font-display text-3xl font-semibold ${errors.length ? "text-status-unverified" : "text-status-verified"}`}>{errors.length}</p>
        </div>
        <div className="surface p-4">
          <p className="flex items-center gap-1 text-xs text-fg-faint"><AlertTriangle className="h-3.5 w-3.5" /> Warnings</p>
          <p className="font-display text-3xl font-semibold text-status-estimate">{warnings.length}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {VERIFICATION_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-sm text-fg-muted">
            <StatusBadge status={s} size="sm" short /> {counts[s]}
          </span>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Integrity report">
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-status-verified"><CheckCircle2 className="h-4 w-4" /> All records valid.</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
              {[...errors, ...warnings].map((i, n) => (
                <li key={n} className="flex gap-2">
                  <span className={i.level === "error" ? "text-status-unverified" : "text-status-estimate"}>{i.level === "error" ? "●" : "○"}</span>
                  <span className="font-mono text-xs text-fg-muted">{i.recordId}</span>
                  <span className="text-xs">{i.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-fg-faint">“Illustration only” warnings clear once a licensed image with attribution is attached.</p>
        </Panel>
        <Panel title="Record template">
          <CopyBlock text={TEMPLATE} />
          <p className="mt-2 text-xs text-fg-faint">Rules: no record may be “verified” without sources and a checkedAt date; generated art can never be flagged as authentic gameplay; theories go in <code>claims</code>, not in steps.</p>
        </Panel>
      </div>

      <Panel title="All records" className="mt-5 min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-fg-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Record</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Sources</th>
                <th className="py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {records.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">
                    <Link href={hrefFor(e)} className="hover:text-violet-300">{e.title}</Link>
                    <span className="block font-mono text-[11px] text-fg-faint">{e.id}</span>
                  </td>
                  <td className="py-2 pr-3 text-fg-muted">{KIND_META[e.kind].label}</td>
                  <td className="py-2 pr-3"><StatusBadge status={e.verification.status} size="sm" short /></td>
                  <td className="py-2 pr-3 text-fg-muted">{e.sources.length}</td>
                  <td className="py-2 text-fg-muted">{e.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
