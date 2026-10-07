"use client";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { RankEmblem } from "@/components/GameAssets";
import { RankChart } from "@/components/RankChart";
import { badgeToLinear, formatBadge } from "@/lib/ranks";

export default function RankPage() {
  return (
    <Gate>
      {({ data }) => {
        const ov = data.overview;
        const hist = ov.rankHistory;
        const peak = hist.reduce((m, r) => Math.max(m, r.badge), 0) || null;
        const first = hist[0]?.badge, lastB = hist[hist.length - 1]?.badge;
        const delta = first && lastB ? (badgeToLinear(lastB) ?? 0) - (badgeToLinear(first) ?? 0) : 0;
        return (
          <>
            <PageTitle title="Rang" sub="Dein Rangverlauf aus den getrackten Ranked-Matches" />
            <section className="surface sheen relative overflow-hidden p-6">
              <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_1fr_1fr]">
                <div className="float justify-self-center"><RankEmblem badge={ov.currentBadge} size={150} /></div>
                <div><div className="label">Aktuell</div><div className="display text-3xl font-extrabold">{ov.currentBadge ? formatBadge(ov.currentBadge) : "Noch ohne Rang"}</div></div>
                <div><div className="label">Peak</div><div className="display text-3xl font-extrabold">{peak ? formatBadge(peak) : "–"}</div></div>
                <div><div className="label">Verlauf</div>
                  <div className="display text-3xl font-extrabold" style={{ color: delta > 0 ? "#3ecf8e" : delta < 0 ? "#f0616d" : undefined }}>{delta > 0 ? "+" : ""}{delta} Stufen</div>
                  <div className="text-xs text-muted">seit dem ältesten getrackten Match</div></div>
              </div>
            </section>
            <section className="surface p-5">
              <h2 className="label mb-3">Rangverlauf</h2>
              {hist.length ? <RankChart points={hist} /> : <Empty title="Noch kein Rangverlauf" text="Ranked-Matches liefern den Rang nach dem Spiel; sie erscheinen hier automatisch." />}
            </section>
          </>
        );
      }}
    </Gate>
  );
}
