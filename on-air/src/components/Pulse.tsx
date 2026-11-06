import { Activity as ActivityIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { useNow } from "../lib/store";
import type { AppSnapshot } from "../lib/types";

const BUCKET_MS = 10 * 60_000;
const W = 600;
const H = 150;
const PAD_X = 18;
const TOP = 20;
const BASE = H - 10;

/** Glatte Kurve durch die Punkte (Catmull-Rom → kubische Bézier). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.min(BASE, p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(BASE, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function sessionTimeline(snap: AppSnapshot): [number, boolean][] {
  if (snap.timeline) return snap.timeline;
  // Ältere Backends ohne Session-Puls: aus Warteschlange und Verlauf zusammensetzen.
  return [...snap.queue, ...snap.recent]
    .filter((r) => r.received_at >= snap.session_started_ms)
    .map((r): [number, boolean] => [r.received_at, r.status === "rejected"])
    .sort((a, b) => a[0] - b[0]);
}

export function topRequester(snap: AppSnapshot): string | null {
  const counts = new Map<string, number>();
  for (const r of [...snap.queue, ...snap.recent]) {
    if (r.received_at < snap.session_started_ms || r.status === "rejected" || r.source === "app") continue;
    counts.set(r.requester.name, (counts.get(r.requester.name) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const e of counts) if (!best || e[1] > best[1]) best = e;
  return best && best[1] > 1 ? best[0] : null;
}

/** Session-Puls: Wünsche pro 10 Minuten als leuchtende Kurve, Höhepunkt markiert. */
export function SessionPulse({ snap }: { snap: AppSnapshot }) {
  const now = useNow(15_000);
  const gid = useId().replace(/:/g, "");
  const [range, setRange] = useState<"session" | "hour">("session");
  const timeline = sessionTimeline(snap);
  const start = range === "hour" ? Math.max(snap.session_started_ms, now - 3_600_000) : snap.session_started_ms;

  const data = useMemo(() => {
    const span = Math.max(BUCKET_MS, now - start);
    const n = Math.max(6, Math.min(24, Math.ceil(span / BUCKET_MS)));
    const size = span / n;
    const buckets = new Array<number>(n).fill(0);
    let total = 0;
    let rejected = 0;
    let recent = 0;
    for (const [ts, rej] of timeline) {
      if (ts < start) continue;
      if (rej) {
        rejected++;
        continue;
      }
      total++;
      if (now - ts <= 15 * 60_000) recent++;
      buckets[Math.min(n - 1, Math.floor((ts - start) / size))]++;
    }
    const max = Math.max(1, ...buckets);
    const step = (W - PAD_X * 2) / (n - 1);
    const pts: [number, number][] = buckets.map((v, i) => [PAD_X + i * step, BASE - (v / max) * (BASE - TOP)]);
    let peak = 0;
    buckets.forEach((v, i) => { if (v > buckets[peak]) peak = i; });
    const perHour = span > 0 ? Math.round((total / span) * 3_600_000) : 0;
    // Spitze auf 10 Minuten normiert (Buckets können bei langen Sessions länger sein).
    const peak10 = Math.round((buckets[peak] * BUCKET_MS) / size);
    return { buckets, pts, peak, total, rejected, recent, perHour, peak10, max };
  }, [timeline, start, now]);

  const line = smoothPath(data.pts);
  const area = line ? `${line} L${W - PAD_X},${H} L${PAD_X},${H} Z` : "";
  const peakPt = data.pts[data.peak];
  const hasData = data.total > 0;
  const top = topRequester(snap);

  return (
    <section className="tile t-pulse" aria-labelledby={`${gid}-h`}>
      <div className="tile-head">
        <span className="tile-title" id={`${gid}-h`}><ActivityIcon size={14} /> {t("pulse.title")}</span>
        <div className="mini-seg" role="group" aria-label={t("pulse.title")}>
          <button type="button" aria-pressed={range === "session"} onClick={() => setRange("session")}>{t("pulse.range_session")}</button>
          <button type="button" aria-pressed={range === "hour"} onClick={() => setRange("hour")}>{t("pulse.range_hour")}</button>
        </div>
      </div>
      <div className="pulse-plot">
        <svg className="pulse-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${t("pulse.total")}: ${data.total}`}>
          <defs>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {hasData && data.pts.map(([x, y], i) => (i % 2 === 1 || i === data.peak ? (
            <line key={i} x1={x} x2={x} y1={y} y2={H} stroke="var(--text-3)" strokeOpacity={i === data.peak ? 0.55 : 0.2} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ) : null))}
          {hasData ? (
            <>
              <path d={area} fill={`url(#${gid}-fill)`} />
              <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" filter={`url(#${gid}-glow)`} vectorEffect="non-scaling-stroke" />
              {data.pts.map(([x, y], i) => (i % 2 === 1 && i !== data.peak ? <circle key={i} cx={x} cy={y} r="4" fill="var(--accent)" /> : null))}
            </>
          ) : (
            <path d={`M${PAD_X},${BASE} L${W - PAD_X},${BASE}`} stroke="var(--accent)" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hasData && peakPt && <span className="pulse-peak" aria-hidden="true" style={{ left: `${(peakPt[0] / W) * 100}%`, top: `${(peakPt[1] / H) * 100}%` }} />}
      </div>
      <div className="pulse-fig">
        <div className="v pulse-value">{data.total}</div>
        <div className="l">{t("pulse.total")} · {hasData ? (data.recent > 0 ? t("pulse.recent", { n: data.recent }) : t("pulse.recent_none")) : t("pulse.empty")}</div>
      </div>
      <div className="pulse-row">
        <div><div className="v">{data.perHour}</div><div className="l">{t("pulse.rate")}</div></div>
        <div><div className="v">{data.peak10}</div><div className="l">{t("pulse.peak")}</div></div>
        <div title={top ?? undefined}><div className="v">{top ?? `${data.rejected}`}</div><div className="l">{top ? t("pulse.top") : t("pulse.rejected")}</div></div>
      </div>
    </section>
  );
}
