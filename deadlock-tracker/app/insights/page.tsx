"use client";
import { Gate, PageTitle } from "@/components/ui";
import { BucketBars, InsightsCard, RadarCard, RecordsCard } from "@/components/widgets";
import { byDuration, byHour, byLobbyStrength, byWeekday } from "@/lib/profile";

export default function InsightsPage() {
  return (
    <Gate>
      {({ data }) => (
        <>
          <PageTitle title="Analyse" sub="Wann, wie lange und gegen wen du am besten spielst – berechnet aus deinen getrackten Matches" />
          <div className="grid gap-6 lg:grid-cols-3">
            <BucketBars title="Winrate nach Tageszeit" hint="Uhrzeit des Match-Starts (lokale Zeit)" buckets={byHour(data.matches)} />
            <BucketBars title="Winrate nach Wochentag" buckets={byWeekday(data.matches)} />
            <BucketBars title="Winrate nach Matchdauer" buckets={byDuration(data.matches)} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <BucketBars title="Gegen wen gewinnst du?" hint="Ø Lobby-Rang im Vergleich zu deinem Rang" buckets={byLobbyStrength(data.matches)} />
            <RadarCard items={data.matches} />
            <RecordsCard items={data.matches} />
          </div>
          <InsightsCard items={data.matches} />
        </>
      )}
    </Gate>
  );
}
