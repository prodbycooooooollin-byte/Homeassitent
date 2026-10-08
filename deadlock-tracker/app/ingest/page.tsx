"use client";
import { useEffect, useState } from "react";
import { PageTitle, Empty } from "@/components/ui";
import { IngestTerminal } from "@/components/IngestTerminal";
import { useIngest } from "@/components/useIngest";

export default function IngestPage() {
  const ing = useIngest();
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => setDesktop(!!window.desktop?.getIngest), []);
  const [mw, setMw] = useState<Awaited<ReturnType<NonNullable<Window["desktop"]>["getMatchWatch"]>> | null>(null);
  useEffect(() => {
    if (!window.desktop?.getMatchWatch) return;
    const load = () => window.desktop!.getMatchWatch().then(setMw).catch(() => null);
    load(); const t = setInterval(load, 5000); return () => clearInterval(t);
  }, []);
  return (
    <>
      <PageTitle title="Match-Daten-Helfer" sub="Live-Konsole von deadlock-api-ingest – so siehst du, dass der Helfer im Hintergrund arbeitet" />
      {desktop === false && <Empty icon="window" title="Nur in der Desktop-App" text="Der Match-Daten-Helfer läuft im Hintergrund der Desktop-App. In der Browser-Version gibt es keine Konsole – installiere die Desktop-App, um ihn zu nutzen." />}
      {desktop !== false && !ing && <div className="skeleton h-[560px]" />}
      {desktop && ing && <IngestTerminal ing={ing} control={(a) => window.desktop!.controlIngest(a)} />}
      {desktop && mw && (
        <section className="surface p-4 text-sm">
          <div className="label mb-1">Sofort-Debrief</div>
          {mw.watching
            ? <p>Beobachtet den Steam-Cache ({mw.dirs.length} Ordner). {mw.last ? <>Zuletzt erkannt: Match <b className="num">#{mw.last.matchId}</b> ({new Date(mw.last.at).toLocaleTimeString("de-DE")}).</> : <span className="text-muted">Noch kein Match erkannt – nach dem nächsten Match erscheint es hier.</span>}</p>
            : <p className="text-loss">Nicht aktiv{mw.error ? `: ${mw.error}` : ""}. Das Debrief erscheint dann erst, wenn der normale Abgleich das Match findet.</p>}
        </section>
      )}
      <p className="text-xs text-muted">Der Helfer liest Match-Salts aus dem Steam-Cache und meldet sie der Deadlock-API. Ein- und ausschalten unter Einstellungen → Desktop-App.</p>
    </>
  );
}
