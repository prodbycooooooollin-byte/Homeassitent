"use client";
import { useEffect, useState } from "react";
import { PageTitle, Empty } from "@/components/ui";
import { IngestTerminal } from "@/components/IngestTerminal";
import { useIngest } from "@/components/useIngest";

export default function IngestPage() {
  const ing = useIngest();
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => setDesktop(!!window.desktop?.getIngest), []);
  return (
    <>
      <PageTitle title="Match-Daten-Helfer" sub="Live-Konsole von deadlock-api-ingest – so siehst du, dass der Helfer im Hintergrund arbeitet" />
      {desktop === false && <Empty icon="window" title="Nur in der Desktop-App" text="Der Match-Daten-Helfer läuft im Hintergrund der Desktop-App. In der Browser-Version gibt es keine Konsole – installiere die Desktop-App, um ihn zu nutzen." />}
      {desktop !== false && !ing && <div className="skeleton h-[560px]" />}
      {desktop && ing && <IngestTerminal ing={ing} control={(a) => window.desktop!.controlIngest(a)} />}
      <p className="text-xs text-muted">Der Helfer liest Match-Salts aus dem Steam-Cache und meldet sie der Deadlock-API. Ein- und ausschalten unter Einstellungen → Desktop-App.</p>
    </>
  );
}
