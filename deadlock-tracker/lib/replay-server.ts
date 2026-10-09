import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fork, type ChildProcess } from "child_process";
import { dataDir } from "./store";
import { fetchReplayUrl } from "./api";
import type { ReplayData } from "./replay-types";
import type { MatchDetails } from "./types";

/** Es bleiben nur die zuletzt erzeugten Replay-Auswertungen erhalten (je ca. 0,5–1 MB); die große Replay-Datei wird nie gespeichert. */
const KEEP = 10;

export type ReplayJob = { state: "running" | "error"; phase: string; pct: number; message?: string; startedAt: number };
const g = globalThis as unknown as { __dlReplayJobs?: Map<number, ReplayJob & { child?: ChildProcess }> };
const jobs = () => (g.__dlReplayJobs ??= new Map());

const dir = () => path.join(dataDir(), "replays");
const fileOf = (matchId: number) => path.join(dir(), `replay-${matchId}.json.gz`);
export const hasReplay = (matchId: number) => fs.existsSync(fileOf(matchId));

export function loadReplay(matchId: number): ReplayData | null {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(fileOf(matchId))).toString("utf8")) as ReplayData; } catch { return null; }
}

export function jobStatus(matchId: number): ReplayJob | null {
  const j = jobs().get(matchId);
  return j ? { state: j.state, phase: j.phase, pct: j.pct, message: j.message, startedAt: j.startedAt } : null;
}

function prune() {
  try {
    const files = fs.readdirSync(dir()).filter((f) => /^replay-\d+\.json\.gz$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir(), f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of files.slice(KEEP)) fs.rmSync(path.join(dir(), x.f), { force: true });
  } catch { /* egal */ }
}

function workerPath(): string {
  const env = process.env.DL_REPLAY_WORKER;
  if (env && fs.existsSync(env)) return env;
  return path.join(process.cwd(), "electron", "replay-worker.mjs");
}

/** Startet die Replay-Auswertung im eigenen Prozess (Download, Entpacken, Parsen). */
export async function startReplay(matchId: number): Promise<ReplayJob> {
  const cur = jobs().get(matchId);
  if (cur?.state === "running") return jobStatus(matchId)!;
  const job: ReplayJob & { child?: ChildProcess } = { state: "running", phase: "Replay-Adresse suchen", pct: 0, startedAt: Date.now() };
  jobs().set(matchId, job);
  const fail = (message: string) => { job.state = "error"; job.message = message; };
  const found = await fetchReplayUrl(matchId).catch((e) => ({ error: `Replay-Adresse nicht abrufbar: ${e instanceof Error ? e.message : e}` }));
  if (!("url" in found)) { fail(found.error); return jobStatus(matchId)!; }
  const url = found.url;
  const wp = workerPath();
  if (!fs.existsSync(wp)) { fail(`Replay-Worker nicht gefunden (${wp}).`); return jobStatus(matchId)!; }
  try {
    const child = fork(wp, [JSON.stringify({ matchId, url, out: fileOf(matchId) })], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] });
    job.child = child;
    let err = "";
    child.stderr?.on("data", (b) => { err = (err + String(b)).slice(-600); });
    child.on("message", (m: { type: string; phase?: string; pct?: number; message?: string }) => {
      if (m.type === "progress") { job.phase = m.phase === "download" ? "Replay laden" : "Replay auswerten"; job.pct = m.pct ?? job.pct; }
      if (m.type === "done") { jobs().delete(matchId); prune(); }
      if (m.type === "error") fail(m.message ?? "Unbekannter Fehler");
    });
    child.on("exit", (code) => { if (job.state === "running" && jobs().get(matchId) === job) fail(code === 0 ? "Beendet ohne Ergebnis" : `Worker abgebrochen (Code ${code}). ${err.trim()}`.trim()); });
    child.on("error", (e) => fail(`Worker konnte nicht starten: ${e.message}`));
  } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
  return jobStatus(matchId)!;
}

/** Ordnet Teams und Helden aus den Match-Daten zu (Replay-Teamnummern sind nur geraten). */
export function mergeDetails(r: ReplayData, d: MatchDetails | null): ReplayData {
  if (!d) return r;
  return { ...r, players: r.players.map((p) => { const m = d.players.find((x) => x.accountId === p.accountId); return m ? { ...p, team: m.team, heroId: m.heroId, name: p.name ?? m.name, slot: m.slot } : p; }) };
}
