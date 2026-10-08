"use client";
import { GradeBadge, GRADE_STYLE } from "../GradeBadge";
import { subOf } from "@/lib/grade";
import { HoverCard } from "../Popover";
import { Icon, type IconName } from "../Icon";
import { GRADE_STEPS } from "@/lib/rating";
import type { Grade, Rating, RoleKey } from "@/lib/types";

const ROLE_ICON: Record<RoleKey, IconName> = { support: "plus", tank: "shield", carry: "sword", pusher: "tower", flex: "shuffle" };
const MAX = 1.9;
const tone = (v: number) => (v >= 1.1 ? "#3ecf8e" : v >= 0.9 ? "#4aa3ff" : "#f0616d");

const SCALE: { g: Grade; steps: string[] }[] = [
  { g: "S", steps: ["+", ""] },
  { g: "A", steps: ["+", "", "−"] },
  { g: "B", steps: ["+", "", "−"] },
  { g: "C", steps: ["+", "", "−"] },
  { g: "D", steps: ["+", "", "−"] },
  { g: "F", steps: ["", "−"] },
];
const FLOOR: Record<Grade, number | null> = Object.fromEntries(GRADE_STEPS.map(([m, g]) => [g, Number.isFinite(m) ? m : null])) as Record<Grade, number | null>;

/** Kompakte Notenskala S–F mit Plus/Minus-Stufen; die aktuelle Note ist hervorgehoben. */
export function GradeScale({ label, grade }: { label?: string; grade: Grade }) {
  const cur = label || grade;
  return (
    <div className="border-t border-white/[0.08] pt-2">
      <div className="mb-1.5 flex items-baseline justify-between text-[10.5px] text-muted">
        <span className="font-semibold uppercase tracking-wider">Notenskala</span>
        <span>Deine Note: <b className="display text-white">{cur}</b> · {GRADE_STYLE[grade].label}</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {SCALE.map(({ g, steps }) => (
          <div key={g} className="grade-scale-cell" data-active={g === grade}>
            <GradeBadge grade={g} size="xs" title={`${g} – ${GRADE_STYLE[g].label}`} />
            <div className="flex flex-col items-center gap-0.5">
              {steps.map((st) => {
                const on = `${g}${st}` === cur;
                return <span key={st} className="grade-scale-step" data-on={on} style={on ? { background: GRADE_STYLE[g].bg } : undefined}>{g}{st}</span>;
              })}
            </div>
            <span className="num text-[9px] text-muted">{FLOOR[g] === null ? "< " + (FLOOR.D ?? 0).toFixed(2) : "≥ " + FLOOR[g]!.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kompakte Aufschlüsselung der Note – erscheint nur im Hover-Popover. */
export function RatingBreakdown({ rating, who }: { rating: Rating; who: string }) {
  const active = rating.components.filter((c) => c.applicable);
  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center gap-3">
        <GradeBadge grade={rating.grade} size="sm" sub={subOf(rating.label)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Note {rating.label || rating.grade} · {GRADE_STYLE[rating.grade].label}</div>
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

      {rating.absolute && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
          <div className="flex items-center gap-2 text-[12px]"><span className="font-medium">Gegen das Rang-Niveau</span><span className="text-[10px] text-muted">{Math.round(rating.absolute.weight * 100)}% der Note</span><span className="num ml-auto font-bold" style={{ color: tone(rating.absolute.score) }}>{rating.absolute.score.toFixed(2)}</span></div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
            {rating.absolute.rows.map((r) => <div key={r.label} className="flex justify-between"><span>{r.label}</span><span><b className="text-white">{r.mine}</b> <span>(Ø {r.ref})</span></span></div>)}
          </div>
        </div>
      )}

      {rating.bonus && <div className="flex justify-between border-t border-white/[0.08] pt-2 text-[12px]"><span>{rating.bonus.label}</span><b className="num" style={{ color: rating.bonus.value >= 0 ? "#3ecf8e" : "#f0616d" }}>{rating.bonus.value >= 0 ? "+" : ""}{rating.bonus.value.toFixed(2)}</b></div>}
      <GradeScale label={rating.label} grade={rating.grade} />
      <div className="space-y-1 border-t border-white/[0.08] pt-2 text-[10.5px] leading-snug text-muted">
        <p><b className="text-white/80">Rolle:</b> {rating.role.label} – {rating.role.reason}.</p>
        {rating.notes.slice(1).map((n, i) => <p key={i}>{n}</p>)}
      </div>
    </div>
  );
}

/** Notenbadge mit Hover-Aufschlüsselung (statt einer dauerhaft sichtbaren Erklärung). */
export function GradeWithBreakdown({ rating, who, size = "sm" }: { rating: Rating | null | undefined; who: string; size?: "xs" | "sm" | "md" | "xl" }) {
  if (!rating) return <GradeBadge grade={null} size={size} />;
  return (
    <HoverCard width={350} content={<RatingBreakdown rating={rating} who={who} />}>
      <span className="cursor-help rounded-lg transition hover:scale-110"><GradeBadge grade={rating.grade} size={size} sub={subOf(rating.label)} title="" /></span>
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
