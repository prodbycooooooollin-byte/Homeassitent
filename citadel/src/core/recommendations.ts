// Deterministisches, nachvollziehbares Empfehlungssystem.
// Jede Regel: Voraussetzungen, Aktion, Begründung, Kompromiss, Quellen, Ausschlussbedingungen.
// Empfehlungen sind "begründet" – erst eine Messung auf diesem PC macht sie zu "gemessen".

import type { HardwareSnapshot, GpuInfo } from './models.ts';
import type { RunStats } from './benchmark.ts';
import { SETTINGS_BY_ID } from './catalog.ts';

export interface Goals {
  targetFps: number | null;
  quality: 'leistung' | 'ausgewogen' | 'qualitaet';
  problem: 'wenig-fps' | 'ruckler' | 'einbrueche' | 'netzwerk' | 'andere' | 'keins';
}

export interface AdvisorContext {
  hw: HardwareSnapshot | null;
  /** Aktuelle Werte der lokalen video.txt je Setting-ID (nur vorhandene Schlüssel). */
  video: Map<string, string>;
  goals: Goals;
  /** Letzte Messung auf diesem PC (falls vorhanden). */
  measured?: { stats: RunStats; gpuBusyShare?: number | null };
}

export type RecAction =
  | { type: 'setting'; settingId: string; value: string }
  | { type: 'windows'; uri: string; label: string }
  | { type: 'link'; url: string; label: string }
  | { type: 'info' };

export interface Recommendation {
  ruleId: string;
  priority: number;
  title: string;
  why: string;
  tradeoff: string;
  current?: string;
  proposed?: string;
  action: RecAction;
  basis: 'begruendet' | 'gemessen';
  confidence: 'niedrig' | 'mittel' | 'hoch';
  sources: { label: string; url?: string; checked: string }[];
  /** Testen = Vorher/Nachher-Messung empfohlen. */
  verbs: ('testen' | 'uebernehmen' | 'anleitung')[];
  undo: string;
}

export interface Rule {
  id: string;
  description: string;
  preconditions: string;
  exclusions: string;
  evaluate(ctx: AdvisorContext): Recommendation | null;
}

const CHECKED = '2026-09-30';
const OPTILOCK = { label: 'OptiLock README (Community, nicht als geprüftes Ergebnis übernommen)', url: 'https://github.com/dacooderr/OptiLock', checked: CHECKED };
const VIDEO_SRC = { label: 'Schlüssel belegt in vom Spiel geschriebener video.txt (Version 20)', url: 'https://github.com/dacooderr/OptiLock', checked: CHECKED };

function activeGpu(hw: HardwareSnapshot | null): GpuInfo | null {
  const list = hw?.gpus.value;
  if (!list || !list.length) return null;
  if (hw!.activeGpuIndex !== null && list[hw!.activeGpuIndex]) return list[hw!.activeGpuIndex];
  return list.length === 1 ? list[0] : null;
}

function setRec(ctx: AdvisorContext, settingId: string, value: string, base: Omit<Recommendation, 'action' | 'current' | 'proposed' | 'undo' | 'basis'>): Recommendation | null {
  const cur = ctx.video.get(settingId);
  if (cur === undefined) return null; // Schlüssel im lokalen Build nicht vorhanden → keine Empfehlung
  if (cur === value) return null;
  const def = SETTINGS_BY_ID.get(settingId);
  return {
    ...base,
    action: { type: 'setting', settingId, value },
    current: cur,
    proposed: value,
    basis: ctx.measured ? 'gemessen' : 'begruendet',
    undo: `Rückgängig über Backup oder Wert zurück auf ${cur} setzen${def?.restartRequired ? ' (Spielneustart nötig)' : ''}.`,
  };
}

const perfProblem = (g: Goals) => g.problem === 'wenig-fps' || g.problem === 'einbrueche' || g.problem === 'ruckler';

export const RULES: Rule[] = [
  {
    id: 'display-refresh',
    description: 'Bildschirm läuft unter seiner höchsten Bildwiederholrate.',
    preconditions: 'Display-Modi ermittelt; aktuelle Hz < höchste Hz bei aktueller Auflösung.',
    exclusions: 'Display-Daten nicht ermittelbar.',
    evaluate(ctx) {
      const d = ctx.hw?.displays.value?.find((x) => x.primary) ?? ctx.hw?.displays.value?.[0];
      if (!d || d.currentHz === null || d.maxHzAtCurrentRes === null || d.currentHz >= d.maxHzAtCurrentRes) return null;
      return {
        ruleId: this.id,
        priority: 95,
        title: `Bildschirm auf ${d.maxHzAtCurrentRes} Hz stellen`,
        why: `Windows meldet für „${d.name}“ aktuell ${d.currentHz} Hz, der Monitor bietet bei ${d.currentWidth}×${d.currentHeight} bis zu ${d.maxHzAtCurrentRes} Hz.`,
        tradeoff: 'Keiner, sofern Kabel und Monitor die Rate stabil unterstützen.',
        current: `${d.currentHz} Hz`,
        proposed: `${d.maxHzAtCurrentRes} Hz`,
        action: { type: 'windows', uri: 'ms-settings:display-advanced', label: 'Erweiterte Anzeigeeinstellungen öffnen' },
        basis: 'begruendet',
        confidence: 'hoch',
        sources: [{ label: 'Windows Display-Modi (EnumDisplaySettings)', checked: CHECKED }],
        verbs: ['anleitung'],
        undo: 'In den Windows-Anzeigeeinstellungen die vorherige Rate wählen.',
      };
    },
  },
  {
    id: 'multi-gpu-assignment',
    description: 'Mehrere GPUs – Zuordnung von Deadlock prüfen.',
    preconditions: 'Mehr als eine GPU erkannt.',
    exclusions: 'Nur eine GPU.',
    evaluate(ctx) {
      const g = ctx.hw?.gpus.value;
      if (!g || g.length < 2) return null;
      return {
        ruleId: this.id,
        priority: 90,
        title: 'Grafikkarten-Zuordnung für Deadlock prüfen',
        why: `Es wurden ${g.length} Grafikadapter erkannt (${g.map((x) => x.name).join(', ')}). Welcher Adapter Deadlock rendert, lässt sich ohne laufendes Spiel nicht sicher ermitteln.`,
        tradeoff: 'Die leistungsstarke GPU verbraucht mehr Strom (Notebook-Akku).',
        action: { type: 'windows', uri: 'ms-settings:display-advancedgraphics', label: 'Windows-Grafikeinstellungen öffnen' },
        basis: 'begruendet',
        confidence: 'mittel',
        sources: [{ label: 'Windows: Grafikeinstellungen pro App', checked: CHECKED }],
        verbs: ['anleitung'],
        undo: 'Zuordnung in den Windows-Grafikeinstellungen auf „Windows entscheiden lassen“ zurücksetzen.',
      };
    },
  },
  {
    id: 'reflex-on',
    description: 'Low Latency (Reflex) einschalten bei NVIDIA-GPU.',
    preconditions: 'Aktive GPU eindeutig NVIDIA; r_low_latency = 0.',
    exclusions: 'Keine eindeutige NVIDIA-GPU; Schlüssel fehlt in lokaler Datei.',
    evaluate(ctx) {
      if (activeGpu(ctx.hw)?.vendor !== 'nvidia') return null;
      return setRec(ctx, 'video.r_low_latency', '1', {
        ruleId: this.id,
        priority: 70,
        title: 'Low Latency (Reflex) einschalten',
        why: 'Die erkannte NVIDIA-GPU unterstützt in der Regel Reflex; es senkt die Systemlatenz, wenn die GPU ausgelastet ist.',
        tradeoff: 'Kaum sichtbarer Kompromiss; FPS können minimal sinken.',
        confidence: 'mittel',
        sources: [VIDEO_SRC],
        verbs: ['uebernehmen', 'testen'],
      });
    },
  },
  {
    id: 'vsync-off-competitive',
    description: 'V-Sync aus für Leistungsziel.',
    preconditions: 'Ziel = Leistung; mat_vsync = 1.',
    exclusions: 'Ziel Bildqualität/Ausgewogen.',
    evaluate(ctx) {
      if (ctx.goals.quality !== 'leistung') return null;
      return setRec(ctx, 'video.mat_vsync', '0', {
        ruleId: this.id,
        priority: 65,
        title: 'V-Sync ausschalten',
        why: 'V-Sync begrenzt die Bildrate auf die Bildwiederholrate und kann die Eingabelatenz erhöhen – ungünstig für das Ziel „Leistung“.',
        tradeoff: 'Bildrisse (Tearing) können sichtbar werden. Mit variabler Bildwiederholrate (G-Sync/FreeSync) oft weniger auffällig.',
        confidence: 'mittel',
        sources: [VIDEO_SRC],
        verbs: ['uebernehmen'],
      });
    },
  },
  {
    id: 'fps-cap-for-stutter',
    description: 'FPS-Limit knapp unter Bildwiederholrate bei Rucklern testen.',
    preconditions: 'Problem = Ruckler; fps_max = 0; Bildwiederholrate bekannt.',
    exclusions: 'Kein Ruckler-Problem; Rate unbekannt.',
    evaluate(ctx) {
      if (ctx.goals.problem !== 'ruckler') return null;
      const hz = ctx.hw?.displays.value?.find((d) => d.primary)?.currentHz ?? null;
      if (!hz) return null;
      if (ctx.video.get('video.fps_max') !== '0') return null;
      return setRec(ctx, 'video.fps_max', String(hz - 3), {
        ruleId: this.id,
        priority: 60,
        title: `FPS-Limit auf ${hz - 3} testen`,
        why: `Ein Limit knapp unter ${hz} Hz kann Frametimes gleichmäßiger machen, besonders mit variabler Bildwiederholrate. Ob es hier hilft, zeigt nur eine Vorher-nachher-Messung.`,
        tradeoff: 'Maximale FPS sinken; bei CPU-Engpass teils ohne Wirkung.',
        confidence: 'niedrig',
        sources: [OPTILOCK],
        verbs: ['testen'],
      });
    },
  },
  {
    id: 'render-scale',
    description: 'Renderauflösung senken bei wenig FPS.',
    preconditions: 'Problem = wenig FPS; Ziel ≠ Bildqualität; mat_viewportscale ≥ 0.95.',
    exclusions: 'Messung zeigt vermutlichen CPU-Engpass.',
    evaluate(ctx) {
      if (ctx.goals.problem !== 'wenig-fps' || ctx.goals.quality === 'qualitaet') return null;
      const cur = Number(ctx.video.get('video.mat_viewportscale'));
      if (!(cur >= 0.95)) return null;
      if (ctx.measured?.gpuBusyShare !== undefined && ctx.measured.gpuBusyShare !== null && ctx.measured.gpuBusyShare < 0.75) return null;
      return setRec(ctx, 'video.mat_viewportscale', '0.850000', {
        ruleId: this.id,
        priority: 55,
        title: 'Renderauflösung auf 85 % testen',
        why: 'Eine niedrigere Renderauflösung entlastet die GPU. Sie hilft nur, wenn die GPU der begrenzende Faktor ist – bei CPU-Engpass bringt sie wenig.',
        tradeoff: 'Bild wird weicher/unschärfer, besonders auf Distanz.',
        confidence: 'niedrig',
        sources: [VIDEO_SRC],
        verbs: ['testen'],
      });
    },
  },
  {
    id: 'shadows-lower',
    description: 'Schattenqualität senken bei FPS-Problemen.',
    preconditions: 'Performance-Problem; Ziel ≠ Bildqualität; Schattenqualität > 0.',
    exclusions: 'Ziel Bildqualität.',
    evaluate(ctx) {
      if (!perfProblem(ctx.goals) || ctx.goals.quality === 'qualitaet') return null;
      const cur = Number(ctx.video.get('video.r_citadel_shadow_quality'));
      if (!(cur > 0)) return null;
      return setRec(ctx, 'video.r_citadel_shadow_quality', String(Math.max(0, cur - 1)), {
        ruleId: this.id,
        priority: 50,
        title: 'Schattenqualität eine Stufe senken',
        why: 'Schatten gehören in vielen Engines zu den teureren Effekten. Eine Stufe weniger ist ein kleiner, gut umkehrbarer Schritt.',
        tradeoff: 'Gröbere, weniger detaillierte Schatten.',
        confidence: 'niedrig',
        sources: [VIDEO_SRC],
        verbs: ['testen'],
      });
    },
  },
  {
    id: 'particles-fights',
    description: 'Partikeldetails senken bei Einbrüchen in Kämpfen.',
    preconditions: 'Problem = Einbrüche in Kämpfen; Partikeldetails > 0.',
    exclusions: 'Anderes Problem.',
    evaluate(ctx) {
      if (ctx.goals.problem !== 'einbrueche') return null;
      const cur = Number(ctx.video.get('video.r_particle_max_detail_level'));
      if (!(cur > 0)) return null;
      return setRec(ctx, 'video.r_particle_max_detail_level', String(Math.max(0, cur - 1)), {
        ruleId: this.id,
        priority: 52,
        title: 'Partikeldetails eine Stufe senken',
        why: 'In Teamkämpfen entstehen viele Fähigkeiten-Effekte gleichzeitig. Weniger Partikeldetails können Einbrüche dort verringern.',
        tradeoff: 'Effekte wirken einfacher.',
        confidence: 'niedrig',
        sources: [VIDEO_SRC],
        verbs: ['testen'],
      });
    },
  },
  {
    id: 'clarity-motion-blur',
    description: 'Bewegungsunschärfe aus für klare Sicht.',
    preconditions: 'Ziel ≠ Bildqualität; Motion Blur an.',
    exclusions: 'Ziel Bildqualität.',
    evaluate(ctx) {
      if (ctx.goals.quality === 'qualitaet') return null;
      return setRec(ctx, 'video.r_citadel_motion_blur', '0', {
        ruleId: this.id,
        priority: 40,
        title: 'Bewegungsunschärfe ausschalten',
        why: 'Unschärfe bei schnellen Drehungen erschwert das Verfolgen von Zielen.',
        tradeoff: 'Bewegungen wirken weniger „filmisch“.',
        confidence: 'mittel',
        sources: [VIDEO_SRC],
        verbs: ['uebernehmen'],
      });
    },
  },
  {
    id: 'vram-textures',
    description: 'Texturstufe bei wenig VRAM senken.',
    preconditions: 'Aktive GPU mit VRAM ≤ 4 GB zuverlässig ermittelt; gpu_mem_level > 0.',
    exclusions: 'VRAM unbekannt oder unzuverlässig.',
    evaluate(ctx) {
      const g = activeGpu(ctx.hw);
      if (!g || g.vramMb === null || g.vramNote || g.vramMb > 4096) return null;
      const cur = Number(ctx.video.get('video.gpu_mem_level'));
      if (!(cur > 0)) return null;
      return setRec(ctx, 'video.gpu_mem_level', String(cur - 1), {
        ruleId: this.id,
        priority: 58,
        title: 'Texturstufe senken (wenig Grafikspeicher)',
        why: `Die GPU meldet ${Math.round(g.vramMb / 1024)} GB Grafikspeicher. Volllaufender VRAM führt oft zu Nachladerucklern. Hinweis: Die Zuordnung von gpu_mem_level zur Texturqualität ist noch ungeprüft.`,
        tradeoff: 'Gröbere Texturen.',
        confidence: 'niedrig',
        sources: [VIDEO_SRC],
        verbs: ['testen'],
      });
    },
  },
  {
    id: 'ram-pressure',
    description: 'Hohe RAM-Belegung sichtbar machen.',
    preconditions: 'RAM-Belegung > 85 % bei Ruckler-/Einbruch-Problem.',
    exclusions: 'RAM-Daten fehlen.',
    evaluate(ctx) {
      const t = ctx.hw?.ramTotalMb.value;
      const u = ctx.hw?.ramUsedMb.value;
      if (!t || !u || u / t < 0.85 || !perfProblem(ctx.goals)) return null;
      return {
        ruleId: this.id,
        priority: 75,
        title: 'Arbeitsspeicher fast voll',
        why: `${Math.round((u / t) * 100)} % des RAM sind belegt. Bei vollem Speicher lagert Windows aus – das kann Ruckler verursachen. CITADEL beendet keine Programme; prüfe im Task-Manager, was du schließen möchtest.`,
        tradeoff: 'Keiner.',
        action: { type: 'windows', uri: 'taskmgr', label: 'Task-Manager öffnen' },
        basis: 'begruendet',
        confidence: 'mittel',
        sources: [{ label: 'Windows Speicherstatus', checked: CHECKED }],
        verbs: ['anleitung'],
        undo: '—',
      };
    },
  },
  {
    id: 'laptop-power',
    description: 'Energieeinstellungen bei Notebooks prüfen.',
    preconditions: 'Gerät als Notebook erkannt.',
    exclusions: 'Kein Notebook oder unbekannt.',
    evaluate(ctx) {
      if (ctx.hw?.laptop.value !== true) return null;
      return {
        ruleId: this.id,
        priority: 45,
        title: 'Netzbetrieb und Energiemodus prüfen',
        why: `Notebooks drosseln im Akkubetrieb oder im Energiesparmodus. Aktueller Energieplan: ${ctx.hw.powerPlan.value ?? 'nicht ermittelbar'}.`,
        tradeoff: 'Mehr Stromverbrauch, Lüfter lauter.',
        action: { type: 'windows', uri: 'ms-settings:powersleep', label: 'Energieeinstellungen öffnen' },
        basis: 'begruendet',
        confidence: 'mittel',
        sources: [{ label: 'Windows Energieeinstellungen', checked: CHECKED }],
        verbs: ['anleitung'],
        undo: 'Vorherigen Energiemodus wieder wählen.',
      };
    },
  },
  {
    id: 'game-mode',
    description: 'Windows-Spielmodus erklären.',
    preconditions: 'Windows erkannt.',
    exclusions: '—',
    evaluate(ctx) {
      if (!ctx.hw?.os.value || !perfProblem(ctx.goals)) return null;
      return {
        ruleId: this.id,
        priority: 20,
        title: 'Windows-Spielmodus prüfen',
        why: 'Der Spielmodus priorisiert das Spiel gegenüber Hintergrundaufgaben (z. B. Windows Update). Ein belegter Vorteil speziell für Deadlock ist CITADEL nicht bekannt.',
        tradeoff: 'Keiner bekannt.',
        action: { type: 'windows', uri: 'ms-settings:gaming-gamemode', label: 'Spielmodus-Einstellungen öffnen' },
        basis: 'begruendet',
        confidence: 'niedrig',
        sources: [{ label: 'Windows Spielmodus', checked: CHECKED }],
        verbs: ['anleitung'],
        undo: 'Schalter wieder umstellen.',
      };
    },
  },
  {
    id: 'network-not-graphics',
    description: 'Netzwerkprobleme von Grafikproblemen trennen.',
    preconditions: 'Problem = Netzwerk/Lag.',
    exclusions: '—',
    evaluate(ctx) {
      if (ctx.goals.problem !== 'netzwerk') return null;
      return {
        ruleId: this.id,
        priority: 99,
        title: 'Lag ist wahrscheinlich kein Grafikproblem',
        why: 'Verzögerte Treffer, Zurücksetzen der Position oder Gummiband-Effekte entstehen durch Netzwerk (Ping, Paketverlust), nicht durch Grafik-Einstellungen. Eine Grafik-Config löst das nicht. Prüfe Kabel statt WLAN, Router-Last und die Region.',
        tradeoff: '—',
        action: { type: 'info' },
        basis: 'begruendet',
        confidence: 'hoch',
        sources: [],
        verbs: [],
        undo: '—',
      };
    },
  },
];

export function recommend(ctx: AdvisorContext): Recommendation[] {
  return RULES.map((r) => r.evaluate(ctx))
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------- Treiber

export interface DriverAdvice {
  vendor: GpuInfo['vendor'];
  installed: string | null;
  officialUrl: string | null;
  statement: string;
  oemNote?: string;
}

/** Nur offizielle Herstellerquellen. Keine „beste Treiberversion“, keine automatische Installation. */
export function driverAdvice(gpu: GpuInfo | null, laptop: boolean | null): DriverAdvice | null {
  if (!gpu) return null;
  const urls: Record<string, string> = {
    nvidia: 'https://www.nvidia.com/en-us/drivers/',
    amd: 'https://www.amd.com/en/support/download/drivers.html',
    intel: 'https://www.intel.com/content/www/us/en/support/detect.html',
  };
  return {
    vendor: gpu.vendor,
    installed: gpu.driverVersion,
    officialUrl: urls[gpu.vendor] ?? null,
    statement:
      'CITADEL kann die Aktualität des Treibers nicht automatisch mit dem Hersteller abgleichen. Ein belegter Vorteil einer bestimmten Treiberversion für Deadlock ist nicht bekannt. „Neuere Version verfügbar“ bedeutet nicht automatisch „hilfreich für Deadlock“.',
    oemNote: laptop ? 'Notebook erkannt: Manche Hersteller liefern angepasste Treiber. Prüfe zuerst die Support-Seite deines Notebook-Herstellers.' : undefined,
  };
}

// ---------------------------------------------------------------- Engpass-Hinweis

export interface BottleneckHint {
  label: 'Wahrscheinlich GPU-limitiert' | 'Wahrscheinlich nicht GPU-limitiert' | 'Möglicher Engpass' | 'Keine Aussage';
  explanation: string;
}

/** Nur mit Messdaten (GPU-Busy-Anteil aus PresentMon 2). Ohne Messung höchstens „Möglicher Engpass“. */
export function bottleneckHint(gpuBusyShare: number | null | undefined): BottleneckHint {
  if (gpuBusyShare === undefined || gpuBusyShare === null) {
    return { label: 'Keine Aussage', explanation: 'Ohne Messung mit GPU-Busy-Daten lässt sich aus CPU-/GPU-Modell allein kein Engpass ableiten.' };
  }
  if (gpuBusyShare >= 0.9)
    return {
      label: 'Wahrscheinlich GPU-limitiert',
      explanation: `Die GPU war im Median ${Math.round(gpuBusyShare * 100)} % der Frametime beschäftigt. Alternativen: aktives FPS-Limit oder V-Sync können ähnliche Werte erzeugen.`,
    };
  if (gpuBusyShare <= 0.7)
    return {
      label: 'Wahrscheinlich nicht GPU-limitiert',
      explanation: `Die GPU war nur ${Math.round(gpuBusyShare * 100)} % der Frametime beschäftigt. Möglich: CPU-Engpass, FPS-Limit, Hintergrundlast oder Synchronisation.`,
    };
  return { label: 'Möglicher Engpass', explanation: `GPU-Busy-Anteil ${Math.round(gpuBusyShare * 100)} % – kein eindeutiges Bild.` };
}

export function gpuBusyShare(frametimes: number[], gpuBusy?: number[]): number | null {
  if (!gpuBusy || gpuBusy.length !== frametimes.length || !gpuBusy.length) return null;
  const ratios = frametimes.map((f, i) => Math.min(1, gpuBusy[i] / f)).sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}
