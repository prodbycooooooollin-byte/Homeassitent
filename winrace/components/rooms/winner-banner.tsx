import { Trophy } from "lucide-react";
import type { TeamView } from "@/lib/types";

const CONFETTI_COLORS = ["#8b5cf6", "#22d3ee", "#f5a524", "#22c55e", "#ec4899"];

export function WinnerBanner({ team, pending }: { team: TeamView; pending: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-8 text-center animate-pop"
      style={{ borderColor: `${team.color}55`, background: `linear-gradient(180deg, ${team.color}22, transparent)` }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 block h-2 w-2 rounded-sm motion-safe:animate-confetti-fall"
            style={{
              left: `${(i * 97) % 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 8) * 0.18}s`,
            }}
          />
        ))}
      </div>
      <Trophy className="mx-auto h-12 w-12" style={{ color: team.color }} />
      <h2 className="mt-3 font-display text-3xl font-extrabold" style={{ color: team.color }}>
        {team.name} gewinnt!
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {pending ? "Vorläufiges Ergebnis – wartet auf Bestätigung durch den Host." : "Die Challenge ist entschieden."}
      </p>
    </div>
  );
}
