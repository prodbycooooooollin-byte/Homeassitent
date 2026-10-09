import { runCycle } from "./lib/sync";

export function startPoller() {
  const g = globalThis as unknown as { __dlPoller?: NodeJS.Timeout };
  if (g.__dlPoller) return;
  // Takt 5 s; runCycle entscheidet selbst, wann Historie-Polls fällig sind (20 s normal, 5 s kurz nach Spielende).
  const intervalMs = 5000;
  const tick = () => {
    runCycle().catch((e) => console.error("[poller]", e));
  };
  g.__dlPoller = setInterval(tick, intervalMs);
  setTimeout(tick, 2000);
  console.log(`[poller] gestartet, Takt ${intervalMs / 1000}s, Historie alle ${process.env.POLL_INTERVAL_S || 20}s`);
}
