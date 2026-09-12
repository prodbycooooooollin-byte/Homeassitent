import type { OverviewData } from "@/lib/queries/overview";
import { DEMO_PERSONAS } from "@/lib/demo/personas";

const DAY = 24 * 60 * 60 * 1000;

export function getDemoOverviewData(): OverviewData {
  const now = Date.now();
  const founded = new Date(now - 265 * DAY);
  const lastStarted = new Date(now - 3 * DAY - 4 * 60 * 60 * 1000);
  const dataSince = new Date(now - 90 * DAY);

  const online = DEMO_PERSONAS.slice(0, 3);

  const activityDays = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * DAY);
    const weekday = date.getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 2 : 0;
    const wave = Math.round(2 + weekendBoost + Math.sin(i / 3) * 1.5);
    return { date: date.toISOString().slice(0, 10), activePlayers: Math.max(0, wave) };
  });

  return {
    server: {
      id: "demo",
      name: "Blockfreunde SMP",
      host: "play.blockfreunde.example",
      port: 25565,
      minecraftVersion: "1.20.1",
      platform: "fabric",
      foundedAt: founded,
      lastStartedAt: lastStarted,
    },
    connectionLevel: "full",
    status: {
      online: true,
      stale: false,
      asOf: new Date(now - 20_000),
      motd: "Blockfreunde SMP — Season 3",
      latencyMs: 34,
    },
    players: {
      online: online.length,
      max: 20,
      onlineList: online.map((p) => ({ uuid: p.uuid, username: p.username })),
    },
    totals: {
      dataSince,
      trackedPlayers: DEMO_PERSONAS.length,
      playtimeTicks: 8_460_000, // ~117 Stunden gesamt
      blocksMined: 284_913,
      mobKills: 12_847,
      deaths: 963,
    },
    modpack: { name: "Blockfreunde Modpack", versionNumber: "3.2.1" },
    activityDays,
  };
}
