"use client";
import { Gate, PageTitle } from "@/components/ui";
import { AchievementGrid } from "@/components/widgets";

export default function AchievementsPage() {
  return (
    <Gate>
      {({ data }) => (
        <>
          <PageTitle title="Erfolge" sub="Freischaltbare Meilensteine – automatisch aus deinen Matches berechnet" />
          <AchievementGrid items={data.matches} />
        </>
      )}
    </Gate>
  );
}
