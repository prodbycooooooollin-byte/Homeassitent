import { DEMO_PERSONAS } from "@/lib/demo/personas";
import type { ChronicleEvent } from "@/components/dashboard/chronicle-section";
import type { WeeklyRecap } from "@/lib/queries/weekly-recap";

const DAY = 24 * 60 * 60 * 1000;

export function getDemoChronicle(): ChronicleEvent[] {
  const now = Date.now();
  return [
    { id: "1", type: "GOAL_COMPLETED", title: "Serverziel erreicht: 10.000 Mobs besiegen", description: null, occurredAt: new Date(now - 5 * DAY), isAutomatic: true, createdByUser: null },
    { id: "2", type: "PROJECT_CREATED", title: "Neues Bauprojekt: Redstone-Farm", description: null, occurredAt: new Date(now - 12 * DAY), isAutomatic: true, createdByUser: null },
    { id: "3", type: "MILESTONE", title: "Spawn fertiggestellt", description: "Nach drei Wochen Arbeit steht der neue Spawnbereich.", occurredAt: new Date(now - 20 * DAY), isAutomatic: false, createdByUser: { displayName: "BauMeisterin_Lea" } },
    { id: "4", type: "SERVER_START", title: "Server gestartet", description: null, occurredAt: new Date(now - 265 * DAY), isAutomatic: true, createdByUser: null },
  ];
}

export function getDemoWeeklyRecap(): WeeklyRecap {
  return {
    since: new Date(Date.now() - 7 * DAY),
    mostActive: DEMO_PERSONAS.slice(0, 3).map((p, i) => ({
      username: p.username,
      uuid: p.uuid,
      playtimeTicks: [92000, 74000, 51000][i],
    })),
    blocksMined: 11_480,
    mobKills: 512,
    goalsCompleted: [{ title: "10.000 Mobs besiegen" }],
    newProjects: [{ title: "Redstone-Farm" }],
  };
}
