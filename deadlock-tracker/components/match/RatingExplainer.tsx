"use client";
import { GradeBadge, GRADE_STYLE } from "../GradeBadge";
import { GRADE_STEPS } from "@/lib/rating";
import type { Grade, Rating, RoleKey } from "@/lib/types";

const ROLE_ICON: Record<RoleKey, string> = { support: "✚", tank: "⛨", carry: "⚔", pusher: "♜", flex: "◇" };
const MAX = 1.9;

/** „Warum diese Note?“ – Rolle, Zusammensetzung aus gewichteten Bausteinen, Bonus, Erläuterungen und Notenskala. */
export function RatingExplainer({ rating, title }: { rating: Rating; title: string }) {
  const active = rating.components.filter((c) => c.applicable);
  const strengths = [...active].sort((a, b) => (b.score - 1) * b.weight - (a.score - 1) * a.weight).filter((c) => c.score > 1.1).slice(0, 2);
  const weaknesses = [...active].sort((a, b) => (a.score - 1) * a.weight - (b.score - 1) * b.weight).filter((c) => c.score < 0.9).slice(0, 2);
  const ladder = [...GRADE_STEPS].reverse();
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center gap-4">
        <GradeBadge grade={rating.grade} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="display text-xl font-bold">Warum {title} diese Note {rating.grade}?</h2>
          <p className="text-sm text-muted">{GRADE_STYLE[rating.grade].label} · Score <b className="num text-white">{rating.score.toFixed(2)}</b> (1.00 = durchschnittlich)</p>
        </div>
        <span className="chip !px-3 !py-1.5 text-sm"><span className="text-amber">{ROLE_ICON[rating.role.key]}</span> Rolle: <b>{rating.role.label}</b></span>
      </div>

      {/* Zusammensetzung: Breite = Gewicht, Farbe = Güte */}
      <div className="mt-5">
        <div className="label mb-2">Zusammensetzung der Note</div>
        <div className="flex h-9 gap-0.5 overflow-hidden rounded-xl">
          {active.map((c) => (
            <div key={c.key} className="flex items-center justify-center overflow-hidden text-[10px] font-bold text-black/80 transition-all"
              style={{ width: `${c.weight * 100}%`, background: c.score >= 1.15 ? "linear-gradient(180deg,#8bf0c0,#3ecf8e)" : c.score >= 0.9 ? "linear-gradient(180deg,#a8d4ff,#4aa3ff)" : "linear-gradient(180deg,#ff9ea6,#f0616d)" }}
              title={`${c.label}: ${Math.round(c.weight * 100)}% Gewicht, Score ${c.score.toFixed(2)}`}>
              {c.weight >= 0.1 ? c.label.split(" ")[0] : ""}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted"><span>Breite = Gewicht in deiner Rolle</span><span>grün stark · blau solide · rot schwach</span></div>
      </div>

      <div className="mt-5 space-y-3.5">
        {rating.components.map((c) => (
          <div key={c.key} className={c.applicable ? "" : "opacity-45"}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{c.label}</span>
              {c.applicable ? <span className="chip !py-0 text-[10px]">{Math.round(c.weight * 100)}% Gewicht</span> : <span className="text-[10px] text-muted">nicht bewertet</span>}
              {c.applicable && <span className="num ml-auto text-sm font-bold" style={{ color: c.score >= 1.1 ? "#3ecf8e" : c.score >= 0.9 ? "#4aa3ff" : "#f0616d" }}>{c.score.toFixed(2)} <span className="text-[10px] font-normal text-muted">→ {c.contribution >= 0 ? "" : ""}{(c.contribution).toFixed(2)} Pkt.</span></span>}
            </div>
            {c.applicable ? (
              <>
                <div className="relative mt-1.5 h-2 rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (c.score / MAX) * 100)}%`, background: c.score >= 1.1 ? "linear-gradient(90deg,#1d8a5c,#3ecf8e)" : c.score >= 0.9 ? "linear-gradient(90deg,#2a62b8,#4aa3ff)" : "linear-gradient(90deg,#a02535,#f0616d)" }} />
                  <span className="absolute -top-0.5 h-3 w-px bg-white/50" style={{ left: `${(1 / MAX) * 100}%` }} title="Durchschnitt" />
                </div>
                <div className="mt-1 text-xs text-muted">{c.detail}</div>
              </>
            ) : (
              <div className="mt-0.5 text-xs text-muted">{c.key === "utility" ? "Nur für Support und Frontline relevant." : c.key === "lane" ? "Keine Lane-Daten verfügbar." : "Keine Vergleichsdaten."}</div>
            )}
          </div>
        ))}
        {rating.bonus && (
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-sm">
            <span>{rating.bonus.label}-Anpassung</span>
            <b className="num" style={{ color: rating.bonus.value >= 0 ? "#3ecf8e" : "#f0616d" }}>{rating.bonus.value >= 0 ? "+" : ""}{rating.bonus.value.toFixed(2)}</b>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="font-semibold">Gesamt-Score</span><span className="display num text-xl font-extrabold">{rating.score.toFixed(2)}</span>
        </div>
      </div>

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-win/30 bg-win/[0.06] p-3 text-sm"><div className="label !text-win mb-1">Stärken</div>{strengths.length ? strengths.map((c) => <div key={c.key}>▲ {c.label}</div>) : <span className="text-muted">–</span>}</div>
          <div className="rounded-xl border border-loss/30 bg-loss/[0.06] p-3 text-sm"><div className="label !text-loss mb-1">Verbesserungspotenzial</div>{weaknesses.length ? weaknesses.map((c) => <div key={c.key}>▼ {c.label}</div>) : <span className="text-muted">Keine auffälligen Schwächen.</span>}</div>
        </div>
      )}

      <div className="mt-5 space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-muted">
        {rating.notes.map((n, i) => <p key={i}>{i === 0 ? "ℹ " : "• "}{n}</p>)}
      </div>

      {/* Notenskala */}
      <div className="mt-5">
        <div className="label mb-2">Notenskala</div>
        <div className="flex gap-1">
          {ladder.map(([min, g], i) => {
            const next = ladder[i + 1]?.[0] ?? Infinity;
            const here = rating.score >= min && rating.score < next;
            return (
              <div key={g} className={`flex-1 rounded-lg border p-1.5 text-center ${here ? "border-white/50 bg-white/[0.08]" : "border-white/[0.06]"}`}>
                <div className="display text-lg font-extrabold" style={{ color: GRADE_STYLE[g as Grade].glow.replace(/[\d.]+\)$/, "1)") }}>{g}</div>
                <div className="num text-[10px] text-muted">{Number.isFinite(min) ? `≥ ${min.toFixed(2)}` : "darunter"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
