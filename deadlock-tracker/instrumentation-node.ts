import { runCycle } from "./lib/sync";

export function startPoller() {
  const g = globalThis as unknown as { __dlPoller?: NodeJS.Timeout };
  if (g.__dlPoller) return;
  const intervalMs = Math.max(5, Number(process.env.POLL_INTERVAL_S) || 20) * 1000;
  const tick = () => {
    runCycle().catch((e) => console.error("[poller]", e));
  };
  g.__dlPoller = setInterval(tick, intervalMs);
  setTimeout(tick, 2000);
  console.log(`[poller] gestartet, Intervall ${intervalMs / 1000}s`);
}
