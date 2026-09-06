import { Trophy } from "lucide-react";
import type { TeamView } from "@/lib/types";

const CONFETTI_COLORS = ["#8b5cf6", "#22d3ee", "#f5a524", "#22c55e", "#ec4899"];

export function WinnerOverlay({ team, pending }: { team: TeamView; pending: boolean }) {
  return (
    <div className="relative flex flex-col items-center gap-3 motion-safe:animate-pop">
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-40 overflow-hidden" aria-hidden>
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 block h-2 w-2 rounded-sm motion-safe:animate-confetti-fall"
            style={{ left: `${(i * 61) % 100}%`, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDelay: `${(i % 10) * 0.15}s` }}
          />
        ))}
      </div>
      <Trophy className="h-[2.5em] w-[2.5em] drop-shadow-lg" style={{ color: team.color }} />
      <p className="text-[2.4em] font-display font-black drop-shadow-lg" style={{ color: team.color }}>
        {team.name} gewinnt!
      </p>
      {pending && <p className="text-[0.9em] text-white/60">Wartet auf Bestätigung durch den Host …</p>}
    </div>
  );
}
