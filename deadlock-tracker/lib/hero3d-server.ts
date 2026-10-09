import fs from "fs";
import path from "path";
import os from "os";
import { execFile, spawn } from "child_process";
import { dataDir } from "./store";

/* 3D-Helden: Das Spiel enthält die Heldenmodelle. Mit dem Open-Source-Werkzeug „Source 2 Viewer“ (CLI, ValveResourceFormat, MIT) wird das Modell
 * aus deiner eigenen Spiel-Installation einmalig nach GLB exportiert und lokal zwischengespeichert. Es wird nichts weitergegeben. */

export type Hero3dJob = { state: "running" | "error"; message: string; startedAt: number };
export interface Hero3dReport { heroId: number; model: string; sizeMB: number; materials: { name: string; shader?: string; textures: Record<string, string>; tied: boolean }[]; images: number; log: string }
export interface BatchStatus { running: boolean; total: number; done: number; current: string; errors: { heroId: number; name: string; message: string }[]; finishedAt: number | null }

const g = globalThis as unknown as { __dlHero3d?: Map<number, Hero3dJob>; __dlHero3dBatch?: BatchStatus; __dlModelIndex?: { key: string; paths: string[] } };
const jobs = () => (g.__dlHero3d ??= new Map());
export const batchStatus = (): BatchStatus => (g.__dlHero3dBatch ??= { running: false, total: 0, done: 0, current: "", errors: [], finishedAt: null });

const modelsDir = () => path.join(dataDir(), "models");
const toolDir = () => path.join(dataDir(), "tools", "s2v");
// v3: Export mit allen Texturparametern (ohne Anpassung), ohne Animationen
export const glbPath = (heroId: number) => path.join(modelsDir(), `hero-${heroId}.v3.glb`);
const reportPath = (heroId: number) => path.join(modelsDir(), `hero-${heroId}.v3.report.json`);
export const hasModel = (heroId: number) => fs.existsSync(glbPath(heroId));
export const modelJob = (heroId: number) => jobs().get(heroId) ?? null;
export const modelReport = (heroId: number): Hero3dReport | null => { try { return JSON.parse(fs.readFileSync(reportPath(heroId), "utf8")); } catch { return null; } };
export const modelReports = (): Hero3dReport[] => { try { return fs.readdirSync(modelsDir()).filter((f) => /\.v3\.report\.json$/.test(f)).flatMap((f) => { try { return [JSON.parse(fs.readFileSync(path.join(modelsDir(), f), "utf8")) as Hero3dReport]; } catch { return []; } }); } catch { return []; } };
export const modelCount = () => { try { return fs.readdirSync(modelsDir()).filter((f) => /\.v3\.glb$/.test(f)).length; } catch { return 0; } };

const CLI_URL = "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/latest/download/cli-windows-x64.zip";

function run(cmd: string, args: string[], timeout = 600_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => resolve({ code: err ? 1 : 0, out: `${stdout}\n${stderr}` }));
  });
}

async function steamRoots(): Promise<string[]> {
  const roots = new Set<string>();
  const pf = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  roots.add(path.join(pf, "Steam"));
  if (process.platform === "win32") {
    const r = await run("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], 5000);
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(r.out);
    if (m) roots.add(m[1].trim().replace(/\//g, path.sep));
  } else roots.add(path.join(os.homedir(), ".steam", "steam"));
  for (const r of [...roots]) {
    try {
      const vdf = fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8");
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.add(m[1].replace(/\\\\/g, "\\"));
    } catch { /* kein Library-Verzeichnis */ }
  }
  return [...roots];
}

export async function findDeadlockPak(): Promise<string | null> {
  for (const r of await steamRoots()) {
    const p = path.join(r, "steamapps", "common", "Deadlock", "game", "citadel", "pak01_dir.vpk");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function ensureCli(): Promise<string> {
  const find = (dir: string): string | null => {
    try { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) { const r = find(p); if (r) return r; } else if (/^Source2Viewer-CLI(\.exe)?$/i.test(f.name)) return p; } } catch { /* leer */ }
    return null;
  };
  const have = find(toolDir());
  if (have) return have;
  fs.mkdirSync(toolDir(), { recursive: true });
  const zip = path.join(toolDir(), "cli.zip");
  const res = await fetch(CLI_URL, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`Werkzeug-Download fehlgeschlagen (HTTP ${res.status})`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const x = await run(process.platform === "win32" ? "tar" : "unzip", process.platform === "win32" ? ["-xf", zip, "-C", toolDir()] : ["-o", zip, "-d", toolDir()], 120_000);
  fs.rmSync(zip, { force: true });
  const exe = find(toolDir());
  if (!exe) throw new Error(`Werkzeug konnte nicht entpackt werden. ${x.out.slice(-200)}`);
  return exe;
}

/** Wählt aus allen Modell-Pfaden den Hauptkörper des Helden (kein Waffen-/Gib-/LOD-/Test-Modell). */
export function pickModel(paths: string[], code: string): string | null {
  const c = code.toLowerCase();
  const own = paths.filter((p) => p.toLowerCase().includes(`/${c}/`) || p.toLowerCase().includes(`/${c}.`) || p.toLowerCase().includes(`_${c}.`) || p.toLowerCase().includes(`/${c}_`));
  const bad = /(weapon|gib|lod\d|_lod|proxy|viewmodel|vm_|ragdoll|phys|attach|prop|fx|cosmetic|shadow|collision|preview_|worldmodel)/i;
  const good = own.filter((p) => !bad.test(p));
  const score = (p: string) => {
    const l = p.toLowerCase();
    let s = 0;
    if (/\/heroes?[_/]/.test(l)) s += 3;
    if (new RegExp(`/${c}\\.vmdl_c$`).test(l)) s += 6;
    if (new RegExp(`/${c}_(body|base|model|skin)?\\.vmdl_c$`).test(l)) s += 3;
    if (/wip|staging|test|old/.test(l)) s -= 1;
    return s * 100 - l.length;
  };
  return (good.length ? good : own).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Alle Modell-Pfade des Spiels – einmal ermitteln und merken (das Durchsuchen des Archivs dauert). */
async function modelIndex(cli: string, pak: string): Promise<string[]> {
  const st = fs.statSync(pak);
  const key = `${pak}|${st.size}|${Math.round(st.mtimeMs)}`;
  if (g.__dlModelIndex?.key === key) return g.__dlModelIndex.paths;
  const file = path.join(toolDir(), "model-index.json");
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (j.key === key && Array.isArray(j.paths)) { g.__dlModelIndex = j; return j.paths; } } catch { /* neu aufbauen */ }
  const paths = await new Promise<string[]>((resolve, reject) => {
    const child = spawn(cli, ["-i", pak, "-l", "-e", "vmdl_c"], { windowsHide: true });
    const found: string[] = [];
    let buf = "";
    child.stdout.on("data", (b) => {
      buf += String(b);
      const lines = buf.split(/\r?\n/); buf = lines.pop() ?? "";
      for (const l of lines) { const m = /(models\/[^\s"']+\.vmdl_c)/i.exec(l); if (m && /hero/i.test(m[1])) found.push(m[1]); }
    });
    child.on("error", reject);
    child.on("close", () => resolve(found));
    setTimeout(() => child.kill(), 300_000);
  });
  g.__dlModelIndex = { key, paths };
  try { fs.mkdirSync(toolDir(), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ key, paths })); } catch { /* egal */ }
  return paths;
}

/** Liest Materialien und Texturen aus der GLB – zur Fehlersuche (welche Teile haben keine Farbtextur?). */
function inspectGlb(file: string): Pick<Hero3dReport, "materials" | "images" | "sizeMB"> {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  const mats = (json.materials ?? []) as { name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown }; extras?: { vmat?: { ShaderName?: string; TextureParams?: Record<string, string> } } }[];
  return {
    materials: mats.map((m) => ({ name: m.name ?? "", shader: m.extras?.vmat?.ShaderName, textures: m.extras?.vmat?.TextureParams ?? {}, tied: !!m.pbrMetallicRoughness?.baseColorTexture })),
    images: (json.images ?? []).length,
    sizeMB: Math.round((buf.length / 1048576) * 10) / 10,
  };
}

async function exportModel(heroId: number, codeName: string, set: (m: string) => void): Promise<void> {
  const pak = await findDeadlockPak();
  if (!pak) throw new Error("Deadlock-Installation nicht gefunden (Steam-Bibliothek).");
  set("Lade das Export-Werkzeug …");
  const cli = await ensureCli();
  set("Suche das Modell im Spiel …");
  const model = pickModel(await modelIndex(cli, pak), codeName);
  if (!model) throw new Error(`Kein Modell für „${codeName}“ gefunden.`);
  set("Exportiere das Modell …");
  const out = path.join(os.tmpdir(), `dl-hero3d-${heroId}-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  const game = path.dirname(pak);
  // Mit allen Optionen zuerst; kennt das Werkzeug eine nicht, mit weniger noch einmal
  const attempts = [
    ["--game", game, "--gltf_export_format", "glb", "--gltf_export_materials"],
    ["--gltf_export_format", "glb", "--gltf_export_materials"],
    ["--gltf_export_format", "glb"],
  ];
  const findGlb = (d: string): string | null => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { const x = findGlb(p); if (x) return x; } else if (/\.glb$/i.test(f.name)) return p; } return null; };
  let glb: string | null = null, log = "";
  for (const flags of attempts) {
    const r = await run(cli, ["-i", pak, "-f", model, "-d", "-o", out, ...flags], 900_000);
    log = r.out;
    glb = findGlb(out);
    if (glb) break;
  }
  if (!glb) throw new Error(`Export lieferte keine GLB-Datei. ${log.slice(-240)}`);
  fs.mkdirSync(modelsDir(), { recursive: true });
  fs.copyFileSync(glb, glbPath(heroId));
  try { fs.writeFileSync(reportPath(heroId), JSON.stringify({ heroId, model, ...inspectGlb(glb), log: log.slice(-3000) })); } catch { /* Diagnose ist optional */ }
  fs.rmSync(out, { recursive: true, force: true });
}

export async function startModel(heroId: number, codeName: string | undefined): Promise<Hero3dJob> {
  const cur = jobs().get(heroId);
  if (cur?.state === "running") return cur;
  const job: Hero3dJob = { state: "running", message: "Suche das Spiel …", startedAt: Date.now() };
  jobs().set(heroId, job);
  (async () => {
    try {
      if (!codeName) throw new Error("Interner Heldenname unbekannt (Asset-Daten fehlen).");
      await exportModel(heroId, codeName, (m) => { job.message = m; });
      jobs().delete(heroId);
    } catch (e) { job.state = "error"; job.message = e instanceof Error ? e.message : String(e); }
  })();
  return job;
}

/** Bereitet alle Helden nacheinander vor (für den Modus „3D-Modell“). Bereits vorhandene werden übersprungen. */
export function startAll(heroes: { id: number; name: string; code?: string }[], force = false): BatchStatus {
  const st = batchStatus();
  if (st.running) return st;
  Object.assign(st, { running: true, total: heroes.length, done: 0, current: "", errors: [], finishedAt: null });
  (async () => {
    for (const h of heroes) {
      st.current = h.name;
      try {
        if (force || !hasModel(h.id)) {
          if (!h.code) throw new Error("Interner Heldenname unbekannt");
          await exportModel(h.id, h.code, (m) => { st.current = `${h.name} – ${m}`; });
        }
      } catch (e) { st.errors.push({ heroId: h.id, name: h.name, message: e instanceof Error ? e.message : String(e) }); }
      st.done++;
    }
    st.running = false; st.current = ""; st.finishedAt = Date.now();
  })();
  return st;
}
