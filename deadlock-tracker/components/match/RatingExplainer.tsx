"use client";
import { GradeBadge, GRADE_STYLE } from "../GradeBadge";
import { HoverCard } from "../Popover";
import { Icon, type IconName } from "../Icon";
import { GRADE_STEPS } from "@/lib/rating";
import type { Rating, RoleKey } from "@/lib/types";

const ROLE_ICON: Record<RoleKey, IconName> = { support: "plus", tank: "shield", carry: "sword", pusher: "tower", flex: "shuffle" };
const MAX = 1.9;
const tone = (v: number) => (v >= 1.1 ? "#3ecf8e" : v >= 0.9 ? "#4aa3ff" : "#f0616d");

/** Kompakte Aufschlüsselung der Note – erscheint nur im Hover-Popover. */
export function RatingBreakdown({ rating, who }: { rating: Rating; who: string }) {
  const active = rating.components.filter((c) => c.applicable);
  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center gap-3">
        <GradeBadge grade={rating.grade} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Note {rating.grade} · {GRADE_STYLE[rating.grade].label}</div>
          <div className="text-[11px] text-muted">{who} · Score <b className="num text-white">{rating.score.toFixed(2)}</b></div>
        </div>
        <span className="chip !py-0.5 text-[11px]"><Icon name={ROLE_ICON[rating.role.key]} size={12} className="text-amber" />{rating.role.label}</span>
      </div>

      <div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {active.map((c) => <div key={c.key} title={`${c.label} ${Math.round(c.weight * 100)}%`} style={{ width: `${c.weight * 100}%`, background: tone(c.score) }} />)}
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-muted"><span>Breite = Gewicht</span><span>Farbe = Güte</span></div>
      </div>

      <div className="space-y-2">
        {rating.components.map((c) => (
          <div key={c.key} className={c.applicable ? "" : "opacity-40"}>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-medium">{c.label}</span>
              {c.applicable ? <span className="text-[10px] text-muted">{Math.round(c.weight * 100)}%</span> : <span className="text-[10px] text-muted">entfällt</span>}
              {c.applicable && <span className="num ml-auto font-bold" style={{ color: tone(c.score) }}>{c.score.toFixed(2)}</span>}
            </div>
            {c.applicable && (
              <>
                <div className="relative mt-1 h-1 rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.score / MAX) * 100)}%`, background: tone(c.score) }} />
                  <span className="absolute -top-0.5 h-2 w-px bg-white/50" style={{ left: `${(1 / MAX) * 100}%` }} />
                </div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-muted">{c.detail}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {rating.bonus && <div className="flex justify-between border-t border-white/[0.08] pt-2 text-[12px]"><span>{rating.bonus.label}</span><b className="num" style={{ color: rating.bonus.value >= 0 ? "#3ecf8e" : "#f0616d" }}>{rating.bonus.value >= 0 ? "+" : ""}{rating.bonus.value.toFixed(2)}</b></div>}
      <div className="space-y-1 border-t border-white/[0.08] pt-2 text-[10.5px] leading-snug text-muted">
        <p><b className="text-white/80">Rolle:</b> {rating.role.label} – {rating.role.reason}.</p>
        {rating.notes.slice(1).map((n, i) => <p key={i}>{n}</p>)}
        <p className="pt-1">Skala: {[...GRADE_STEPS].reverse().map(([m, g]) => `${g}${Number.isFinite(m) ? ` ≥${m.toFixed(2)}` : ""}`).join(" · ")}</p>
      </div>
    </div>
  );
}

/** Notenbadge mit Hover-Aufschlüsselung (statt einer dauerhaft sichtbaren Erklärung). */
export function GradeWithBreakdown({ rating, who, size = "sm" }: { rating: Rating | null | undefined; who: string; size?: "xs" | "sm" | "md" | "xl" }) {
  if (!rating) return <GradeBadge grade={null} size={size} />;
  return (
    <HoverCard width={350} content={<RatingBreakdown rating={rating} who={who} />}>
      <span className="cursor-help rounded-lg transition hover:scale-110"><GradeBadge grade={rating.grade} size={size} title="" /></span>
    </HoverCard>
  );
}

/** Kleines Info-Symbol neben einer Note: Hover zeigt, wie sie zustande kam. */
export function RatingHint({ rating, who }: { rating: Rating | null | undefined; who: string }) {
  if (!rating) return null;
  return (
    <HoverCard width={350} content={<RatingBreakdown rating={rating} who={who} />}>
      <button aria-label="Wie entsteht diese Note?" className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-muted transition hover:border-amber hover:text-amber"><Icon name="info" size={14} /></button>
    </HoverCard>
  );
}
