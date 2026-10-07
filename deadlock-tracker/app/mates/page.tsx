"use client";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { Avatar, HeroPortrait } from "@/components/GameAssets";

export default function MatesPage() {
  return (
    <Gate>
      {({ data }) => (
        <>
          <PageTitle title="Mitspieler" sub="Spieler, mit denen du mindestens 2× im selben Team gespielt hast" />
          {data.mates.length === 0 ? (
            <Empty title="Noch keine Stammspieler" text="Sobald du mehrfach mit denselben Spielern spielst, erscheinen sie hier – berechnet aus allen Matches mit vollständigen Details." />
          ) : (
            <section className="surface overflow-hidden">
              {data.mates.map((m, i) => {
                const wr = m.wins / m.games;
                return (
                  <div key={m.accountId} className="fade-up flex items-center gap-4 border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.04]" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <span className="display w-7 text-center text-lg text-muted">{i + 1}</span>
                    <Avatar src={m.avatar} name={m.name ?? String(m.accountId)} size={42} ring="#ffffff22" />
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{m.name ?? `Spieler ${m.accountId}`}</div><div className="text-xs text-muted">ID {m.accountId}</div></div>
                    <div className="hidden gap-1 sm:flex">{m.heroIds.slice(0, 4).map((h) => <HeroPortrait key={h} id={h} size={30} variant="small" className="!rounded-lg" />)}</div>
                    <div className="num w-20 text-right"><div className="font-semibold">{m.games}</div><div className="text-xs text-muted">Spiele</div></div>
                    <div className="w-36"><div className="num mb-1 text-right text-sm font-semibold" style={{ color: wr >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(wr * 100)}% Winrate</div>
                      <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${wr * 100}%`, background: wr >= 0.5 ? "linear-gradient(90deg,#1d8a5c,#3ecf8e)" : "linear-gradient(90deg,#a02535,#f0616d)" }} /></div></div>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </Gate>
  );
}
