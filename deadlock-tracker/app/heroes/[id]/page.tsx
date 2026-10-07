"use client";
import { Empty, Gate } from "@/components/ui";
import { HeroBackdrop, HeroPortrait, useHero, useHeroName } from "@/components/GameAssets";
import { GradeBadge } from "@/components/GradeBadge";
import { MatchRow } from "@/components/MatchRow";
import { NavLink } from "@/components/NavLink";
import { Sparkline, WinRing } from "@/components/charts";
import { gradeFor } from "@/lib/rating";

export default function HeroDetailPage({ params }: { params: { id: string } }) {
  const heroId = Number(params.id);
  const heroName = useHeroName();
  const { color } = useHero(heroId);
  return (
    <Gate>
      {({ me, data }) => {
        const h = data.heroes.find((x) => x.heroId === heroId);
        const ms = data.matches.filter((m) => m.heroId === heroId);
        const trend = ms.filter((m) => m.score !== null).slice(0, 30).map((m) => m.score as number).reverse();
        return (
          <>
            <NavLink href="/heroes" className="btn btn-ghost !w-fit !px-3 !py-1.5 text-xs">← Alle Helden</NavLink>
            <section className="surface relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${color}40, 0 40px 80px -40px ${color}77` }}>
              <HeroBackdrop id={heroId} />
              <div className="relative flex flex-wrap items-center gap-6 p-6 md:p-8">
                <HeroPortrait id={heroId} size={140} h={180} ring={color} className="float !rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <h1 className="display text-5xl font-extrabold tracking-tight">{heroName(heroId)}</h1>
                  {h ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="chip">{h.matches} Spiele</span><span className="chip">KDA {h.kda.toFixed(2)}</span>
                      <span className="chip">{Math.round(h.soulsPerMin)} Souls/Min</span>
                      {h.bestGrade && <span className="chip">Beste Note <GradeBadge grade={h.bestGrade} size="xs" /></span>}
                    </div>
                  ) : <p className="mt-2 text-muted">Mit diesem Helden hast du noch kein Match gespielt.</p>}
                </div>
                {h && <WinRing value={h.wins / h.matches} wins={h.wins} losses={h.matches - h.wins} size={124} />}
              </div>
            </section>
            {h && (
              <section className="surface p-5">
                <h2 className="label mb-3">Leistungsverlauf mit {heroName(heroId)}</h2>
                <Sparkline values={trend} />
              </section>
            )}
            {ms.length ? (
              <section className="surface overflow-hidden">
                <div className="border-b border-white/[0.06] px-4 py-3"><h2 className="display text-lg font-bold">Matches</h2></div>
                {ms.slice(0, 30).map((m, i) => <MatchRow key={m.matchId} m={m} account={me.accountId} delay={i * 30} />)}
              </section>
            ) : <Empty title="Keine Matches" />}
          </>
        );
      }}
    </Gate>
  );
}
