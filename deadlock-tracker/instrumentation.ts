/** Startet beim Serverstart den Hintergrund-Poller – Matches werden auch erkannt, wenn kein Browser offen ist. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("./instrumentation-node");
    startPoller();
  }
}
