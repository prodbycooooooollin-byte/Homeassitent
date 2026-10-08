import fs from "fs";
import path from "path";
import os from "os";
import { execFile, spawn } from "child_process";
import { dataDir } from "./store";

/* 3D-Helden (Beta): Das Spiel enthält die Heldenmodelle. Mit dem Open-Source-Werkzeug „Source 2 Viewer“ (CLI, ValveResourceFormat, MIT) wird das Modell
 * aus deiner eigenen Spiel-Installation einmalig nach GLB exportiert und lokal zwischengespeichert. Es wird nichts weitergegeben. */

export type Hero3dJob = { state: "running" | "error"; message: string; startedAt: number };
const g = globalThis as unknown as { __dlHero3d?: Map<number, Hero3dJob> };
const jobs = () => (g.__dlHero3d ??= new Map());

const modelsDir = () => path.join(dataDir(), "models");
const toolDir = () => path.join(dataDir(), "tools", "s2v");
// v2: Export mit Materialien/Texturen (v1 hatte keine)
export const glbPath = (heroId: number) => path.join(modelsDir(), `hero-${heroId}.v2.glb`);
export const hasModel = (heroId: number) => fs.existsSync(glbPath(heroId));
export const modelJob = (heroId: number) => jobs().get(heroId) ?? null;

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

async function listModels(cli: string, pak: string, code: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, ["-i", pak, "-l", "-e", "vmdl_c"], { windowsHide: true });
    const found: string[] = [];
    let buf = "";
    const needle = code.toLowerCase();
    child.stdout.on("data", (b) => {
      buf += String(b);
      const lines = buf.split(/\r?\n/); buf = lines.pop() ?? "";
      for (const l of lines) { const m = /(models\/[^\s"']+\.vmdl_c)/i.exec(l); if (m && m[1].toLowerCase().includes(needle)) found.push(m[1]); }
    });
    child.on("error", reject);
    child.on("close", () => resolve(found));
    setTimeout(() => { child.kill(); }, 300_000);
  });
}

export async function startModel(heroId: number, codeName: string | undefined): Promise<Hero3dJob> {
  const cur = jobs().get(heroId);
  if (cur?.state === "running") return cur;
  const job: Hero3dJob = { state: "running", message: "Suche das Spiel …", startedAt: Date.now() };
  jobs().set(heroId, job);
  (async () => {
    try {
      if (!codeName) throw new Error("Interner Heldenname unbekannt (Asset-Daten fehlen).");
      const pak = await findDeadlockPak();
      if (!pak) throw new Error("Deadlock-Installation nicht gefunden (Steam-Bibliothek).");
      job.message = "Lade das Export-Werkzeug …";
      const cli = await ensureCli();
      job.message = "Suche das Modell im Spiel …";
      const paths = await listModels(cli, pak, codeName);
      const model = pickModel(paths, codeName);
      if (!model) throw new Error(`Kein Modell für „${codeName}“ gefunden (${paths.length} Treffer).`);
      job.message = "Exportiere das Modell …";
      const out = path.join(os.tmpdir(), `dl-hero3d-${heroId}-${Date.now()}`);
      fs.mkdirSync(out, { recursive: true });
      // Zuerst mit allen Optionen (Texturen, Animationen); falls das Werkzeug eine Option nicht kennt, mit weniger noch einmal
      const attempts = [
        ["--gltf_export_format", "glb", "--gltf_export_materials", "--gltf_textures_adapt", "--gltf_export_animations"],
        ["--gltf_export_format", "glb", "--gltf_export_materials", "--gltf_export_animations"],
        ["--gltf_export_format", "glb", "--gltf_export_materials"],
        ["--gltf_export_format", "glb"],
      ];
      const findGlb = (d: string): string | null => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { const x = findGlb(p); if (x) return x; } else if (/\.glb$/i.test(f.name)) return p; } return null; };
      let glb: string | null = null, last = "";
      for (const flags of attempts) {
        const r = await run(cli, ["-i", pak, "-f", model, "-d", "-o", out, ...flags], 900_000);
        last = r.out;
        glb = findGlb(out);
        if (glb) break;
      }
      if (!glb) throw new Error(`Export lieferte keine GLB-Datei. ${last.slice(-240)}`);
      fs.mkdirSync(modelsDir(), { recursive: true });
      fs.copyFileSync(glb, glbPath(heroId));
      fs.rmSync(out, { recursive: true, force: true });
      jobs().delete(heroId);
    } catch (e) {
      job.state = "error"; job.message = e instanceof Error ? e.message : String(e);
    }
  })();
  return job;
}
