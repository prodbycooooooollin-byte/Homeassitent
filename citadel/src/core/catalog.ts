// Versionierter Einstellungskatalog.
//
// Statuswerte:
//  - confirmed   (bestätigt): Schlüssel, Wirkung und Schreibweg in einem genannten Build geprüft.
//  - unverified  (noch ungeprüft): Schlüssel in echten Dateien/ConVar-Listen belegt, Wirkung nicht im Spiel geprüft.
//  - deprecated  (veraltet)
//  - unsupported (nicht unterstützt)
//
// Anwendbarkeit (applyPolicy):
//  - 'if-present': Darf nur geschrieben werden, wenn das Spiel den Schlüssel in der lokalen Datei selbst
//    angelegt hat (Beleg: der aktuelle Build kennt ihn). Wert muss im Katalogbereich liegen.
//  - 'direct':     Darf in eine Benutzer-Config (autoexec.cfg) geschrieben werden. Übernahme durch das Spiel
//                  wird separat bestätigt.
//  - 'draft-only': Nur als Entwurf analysierbar, wird nicht angewendet (z. B. ungeprüfte gameinfo.gi-ConVars).
//
// Nichts in diesem Katalog ist aus anderen Source-Spielen übernommen: Jeder Schlüssel ist mit einer
// Deadlock-Quelle belegt (siehe EVIDENCE).

export const CATALOG_VERSION = '2026.09.30-1';

export type SettingStatus = 'confirmed' | 'unverified' | 'deprecated' | 'unsupported';
export type ConfigFileKind = 'video.txt' | 'gameinfo.gi' | 'autoexec.cfg';
export type SettingCategory = 'anzeige' | 'grafik' | 'sichtbarkeit' | 'crosshair' | 'maus' | 'eingabe' | 'audio' | 'erweitert';
export type ValueType = 'bool01' | 'boolword' | 'int' | 'float' | 'enum';
export type ApplyPolicy = 'if-present' | 'direct' | 'draft-only';
export type EvidenceLevel = 'gemessen' | 'belegt' | 'plausibel' | 'unbekannt';
/** Bereich für Profil-Mixer und selektive Übernahme. */
export type SettingGroup = 'grafik' | 'anzeige' | 'crosshair' | 'eingabe' | 'geraet';

export interface Evidence {
  id: string;
  title: string;
  url: string;
  /** Datum der Quelle (Commit-/Veröffentlichungsdatum), nicht des Abrufs. */
  date: string;
  retrieved: string;
  note: string;
}

export const EVIDENCE: Record<string, Evidence> = {
  'optilock-videotxt-screenshot': {
    id: 'optilock-videotxt-screenshot',
    title: 'OptiLock – Beispielbild einer vom Spiel geschriebenen video.txt (Version 20)',
    url: 'https://github.com/dacooderr/OptiLock/blob/main/OptiLock%20FPS%20Config%20(Recommended)/videotxtexample.png',
    date: '2026-09-29',
    retrieved: '2026-09-30',
    note: 'Zeigt Dateikopf "video.cfg", Version 20, VendorID/DeviceID und alle setting.*-Schlüssel. Schlüsselnamen belegt; Bedeutung der Werte nicht.',
  },
  'optilock-cvarlist': {
    id: 'optilock-cvarlist',
    title: 'OptiLock cvarlist.md – ConVar-Liste mit Standardwerten und Flags',
    url: 'https://github.com/dacooderr/OptiLock/blob/main/cvarlist.md',
    date: '2026-09-29',
    retrieved: '2026-09-30',
    note: 'Community-Export der ConVars (Name, Beschreibung, Standard, Flags). Build-Stand nicht angegeben.',
  },
  'optilock-gameinfo': {
    id: 'optilock-gameinfo',
    title: 'OptiLock gameinfo.gi (ver. 4.6)',
    url: 'https://github.com/dacooderr/OptiLock/blob/main/OptiLock%20FPS%20Config%20(Recommended)/gameinfo.gi',
    date: '2026-09-29',
    retrieved: '2026-09-30',
    note: 'Belegt die Struktur GameInfo → ConVars und dort gesetzte Variablen. Performance-Versprechen des Presets sind nicht übernommen.',
  },
  'skipeo-autoexec': {
    id: 'skipeo-autoexec',
    title: 'Skip-eo Deadlock-Config autoexec.cfg (als veraltet markiert)',
    url: 'https://github.com/Skip-eo/Deadlock-Config',
    date: '2025-04-22',
    retrieved: '2026-09-30',
    note: 'Historische Community-Angabe zu autoexec.cfg im cfg-Ordner und zu r_low_latency (0/1/2). Veraltet – nur Hinweis, kein Beleg für den aktuellen Build.',
  },
};

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDefinition {
  id: string;
  label: string;
  description: string;
  category: SettingCategory;
  group: SettingGroup;
  file: ConfigFileKind;
  /** Schlüssel in der Datei, z. B. "setting.fps_max" oder "citadel_crosshair_pip_gap". */
  key: string;
  /** Für gameinfo.gi: Block-Pfad. */
  block?: string[];
  type: ValueType;
  min?: number;
  max?: number;
  step?: number;
  options?: SettingOption[];
  default?: string;
  /** false: gerätespezifisch – wird nie aus fremden Profilen übernommen oder exportiert. */
  portable: boolean;
  restartRequired: boolean;
  status: SettingStatus;
  applyPolicy: ApplyPolicy;
  evidence: string[];
  impact?: { visual: string; performance: string; level: EvidenceLevel };
  dependsOn?: string[];
  note?: string;
  /** Profil-Mixer: gehört zur reinen Grafikoptimierung. */
}

const V = (key: string) => `setting.${key}`;
const VIDEO_EV = ['optilock-videotxt-screenshot'];

function video(
  key: string,
  label: string,
  description: string,
  category: SettingCategory,
  type: ValueType,
  extra: Partial<SettingDefinition> = {},
): SettingDefinition {
  return {
    id: `video.${key}`,
    label,
    description,
    category,
    group: category === 'anzeige' ? 'anzeige' : 'grafik',
    file: 'video.txt',
    key: V(key),
    type,
    portable: true,
    restartRequired: true,
    status: 'unverified',
    applyPolicy: 'if-present',
    evidence: VIDEO_EV,
    ...extra,
  };
}

const onOff01: SettingOption[] = [
  { value: '0', label: 'Aus' },
  { value: '1', label: 'An' },
];
const onOffWord: SettingOption[] = [
  { value: 'false', label: 'Aus' },
  { value: 'true', label: 'An' },
];
const level03: SettingOption[] = [
  { value: '0', label: 'Stufe 0 (niedrigste)' },
  { value: '1', label: 'Stufe 1' },
  { value: '2', label: 'Stufe 2' },
  { value: '3', label: 'Stufe 3' },
];

function crosshair(key: string, label: string, type: ValueType, def: string, extra: Partial<SettingDefinition> = {}): SettingDefinition {
  return {
    id: `cfg.${key}`,
    label,
    description: `Crosshair-ConVar ${key}. Standardwert laut ConVar-Liste: ${def}.`,
    category: 'crosshair',
    group: 'crosshair',
    file: 'autoexec.cfg',
    key,
    type,
    default: def,
    portable: true,
    restartRequired: false,
    status: 'unverified',
    applyPolicy: 'direct',
    evidence: ['optilock-cvarlist'],
    impact: { visual: 'Nur Darstellung des Fadenkreuzes.', performance: 'Kein Performance-Einfluss zu erwarten.', level: 'plausibel' },
    note: 'Wird über einen CITADEL-Abschnitt in autoexec.cfg gesetzt. Ob Deadlock autoexec.cfg im aktuellen Build automatisch ausführt, ist noch ungeprüft – alternativ Konsolenbefehl kopieren.',
    ...extra,
  };
}

export const SETTINGS: SettingDefinition[] = [
  // ---------- Anzeige (video.txt) ----------
  video('fullscreen', 'Vollbild', 'Exklusiver Vollbildmodus. In Kombination mit „Randlos“ ergibt sich der Fenstermodus.', 'anzeige', 'bool01', { options: onOff01 }),
  video('nowindowborder', 'Randloses Fenster', 'Fenster ohne Rahmen (randloser Fenstermodus), wenn Vollbild aus ist.', 'anzeige', 'bool01', { options: onOff01 }),
  video('defaultres', 'Auflösung – Breite', 'Horizontale Auflösung in Pixeln. -1 bedeutet: das Spiel wählt selbst.', 'anzeige', 'int', {
    min: -1,
    max: 16384,
    step: 1,
    portable: false,
    note: 'Monitorabhängig – wird nie aus fremden Profilen übernommen.',
  }),
  video('defaultresheight', 'Auflösung – Höhe', 'Vertikale Auflösung in Pixeln. -1 bedeutet: das Spiel wählt selbst.', 'anzeige', 'int', { min: -1, max: 16384, step: 1, portable: false }),
  video('refreshrate_numerator', 'Bildwiederholrate (Zähler)', 'Zähler der Bildwiederholrate. 0 = automatisch.', 'anzeige', 'int', { min: 0, max: 1000000, portable: false }),
  video('refreshrate_denominator', 'Bildwiederholrate (Nenner)', 'Nenner der Bildwiederholrate. 0 = automatisch.', 'anzeige', 'int', { min: 0, max: 1000000, portable: false }),
  video('monitor_index', 'Monitor', 'Index des Bildschirms, auf dem das Spiel startet.', 'anzeige', 'int', { min: 0, max: 16, portable: false }),
  video('aspectratiomode', 'Seitenverhältnis-Modus', 'Interner Modus des Seitenverhältnisses. Bedeutung der Werte noch ungeprüft.', 'anzeige', 'int', { min: 0, max: 3 }),
  video('high_dpi', 'High-DPI', 'High-DPI-Unterstützung des Fensters.', 'anzeige', 'bool01', { options: onOff01, portable: false }),
  video('fullscreen_min_on_focus_loss', 'Minimieren bei Fokusverlust', 'Minimiert das Vollbild, wenn ein anderes Fenster aktiv wird.', 'anzeige', 'bool01', { options: onOff01 }),
  video('mat_vsync', 'V-Sync', 'Vertikale Synchronisation. Verhindert Tearing, kann Eingabelatenz erhöhen.', 'anzeige', 'bool01', {
    options: onOff01,
    impact: { visual: 'An: kein Tearing.', performance: 'An: FPS auf Bildwiederholrate begrenzt, höhere Latenz möglich.', level: 'plausibel' },
  }),
  video('fps_max', 'FPS-Limit', 'Obergrenze der Bildrate. 0 = kein Limit.', 'anzeige', 'int', {
    min: 0,
    max: 1000,
    step: 1,
    impact: { visual: 'Keine.', performance: 'Ein Limit knapp unter der Bildwiederholrate kann Frametimes glätten; ob es hilft, zeigt nur eine Messung.', level: 'plausibel' },
  }),
  video('r_low_latency', 'Low Latency (NVIDIA Reflex)', 'Latenzreduzierung. 0 = aus, 1 = an. Wert 2 (an + Boost) nur laut veralteter Community-Angabe.', 'anzeige', 'int', {
    options: [
      { value: '0', label: 'Aus' },
      { value: '1', label: 'An' },
      { value: '2', label: 'An + Boost (ungeprüft)' },
    ],
    evidence: [...VIDEO_EV, 'skipeo-autoexec'],
    impact: { visual: 'Keine.', performance: 'Kann Systemlatenz senken, wirkt nur mit unterstützter GPU.', level: 'plausibel' },
  }),
  video('r_fullscreen_gamma', 'Helligkeit (Gamma)', 'Gamma im Vollbild. Höhere Werte = dunkler/heller je nach Kurve; Wirkung im Fenstermodus ungeprüft.', 'anzeige', 'float', { min: 1.0, max: 3.0, step: 0.05 }),
  video('r_reduce_flash', 'Blitzeffekte reduzieren', 'Reduziert grelle Blitzeffekte.', 'sichtbarkeit', 'bool01', { options: onOff01, group: 'grafik' }),
  video('r_light_sensitivity_mode', 'Lichtempfindlichkeitsmodus', 'Mildert helle Effekte für lichtempfindliche Spieler.', 'sichtbarkeit', 'boolword', { options: onOffWord, group: 'grafik' }),
  video('r_citadel_outlines', 'Umrisse', 'Umrisslinien um Helden/Objekte.', 'sichtbarkeit', 'bool01', {
    options: onOff01,
    group: 'grafik',
    impact: { visual: 'Aus: Gegner schwerer erkennbar.', performance: 'Geringer Einfluss erwartet.', level: 'unbekannt' },
  }),

  // ---------- Grafik (video.txt) ----------
  video('mat_viewportscale', 'Renderauflösung (Skalierung)', 'Anteil der Renderauflösung an der Ausgabeauflösung (1.0 = 100 %).', 'grafik', 'float', {
    min: 0.25,
    max: 1.0,
    step: 0.05,
    impact: { visual: 'Niedriger: unschärferes Bild.', performance: 'Entlastet vor allem die GPU; bei CPU-Engpass kaum Wirkung.', level: 'plausibel' },
  }),
  video('r_citadel_upscaling', 'Upscaling-Verfahren', 'Auswahl des Upscalers. 0 = aus; die Zuordnung der übrigen Werte (FSR/DLSS/…) ist noch ungeprüft.', 'grafik', 'int', {
    min: 0,
    max: 4,
    impact: { visual: 'Upscaling kann weicher wirken.', performance: 'Kann GPU-Last senken.', level: 'unbekannt' },
  }),
  video('r_citadel_dlss_settings_mode', 'DLSS-Modus', 'DLSS-Qualitätsmodus. Werte-Zuordnung ungeprüft; nur mit NVIDIA RTX relevant.', 'grafik', 'int', { min: 0, max: 5, dependsOn: ['video.r_citadel_upscaling'] }),
  video('r_citadel_fsr_rcas_sharpness', 'FSR-Schärfe', 'Nachschärfung für FSR (RCAS).', 'grafik', 'float', { min: 0, max: 2, step: 0.05, dependsOn: ['video.r_citadel_upscaling'] }),
  video('r_citadel_antialiasing', 'Kantenglättung', 'Anti-Aliasing-Verfahren. 0 = aus; übrige Werte ungeprüft.', 'grafik', 'int', {
    min: 0,
    max: 4,
    impact: { visual: 'Aus: sichtbare Treppenstufen.', performance: 'Kantenglättung kostet GPU-Zeit.', level: 'plausibel' },
  }),
  video('cpu_level', 'Detailstufe (cpu_level)', 'Interner Detailregler. Genaue Zuordnung zum Menüpunkt noch ungeprüft.', 'grafik', 'int', { options: level03 }),
  video('gpu_level', 'Detailstufe (gpu_level)', 'Interner Detailregler. Genaue Zuordnung zum Menüpunkt noch ungeprüft.', 'grafik', 'int', { options: level03 }),
  video('gpu_mem_level', 'Texturstufe (gpu_mem_level)', 'Vermutlich Texturqualität/Grafikspeicher. Zuordnung ungeprüft.', 'grafik', 'int', {
    options: level03,
    impact: { visual: 'Niedriger: gröbere Texturen.', performance: 'Relevant bei wenig VRAM.', level: 'unbekannt' },
  }),
  video('mem_level', 'Speicherstufe (mem_level)', 'Interne Speicherstufe. Zuordnung ungeprüft.', 'grafik', 'int', { options: level03 }),
  video('shaderquality', 'Shaderqualität', 'Qualität der Shader.', 'grafik', 'bool01', { options: onOff01 }),
  video('r_shadows', 'Schatten', 'Dynamische Schatten.', 'grafik', 'bool01', {
    options: onOff01,
    impact: { visual: 'Aus: deutlich flacheres Bild.', performance: 'Schatten sind oft teuer.', level: 'plausibel' },
  }),
  video('r_citadel_shadow_quality', 'Schattenqualität', 'Qualitätsstufe der Schatten.', 'grafik', 'int', { min: 0, max: 3, dependsOn: ['video.r_shadows'] }),
  video('r_citadel_ssao', 'Umgebungsverdeckung (SSAO)', 'Screen-Space Ambient Occlusion.', 'grafik', 'bool01', { options: onOff01 }),
  video('r_citadel_ssao_quality', 'SSAO-Qualität', 'Qualitätsstufe der Umgebungsverdeckung.', 'grafik', 'int', { min: 0, max: 3, dependsOn: ['video.r_citadel_ssao'] }),
  video('r_citadel_fog_quality', 'Nebelqualität', 'Qualitätsstufe volumetrischer Effekte.', 'grafik', 'int', { min: 0, max: 3 }),
  video('r_particle_max_detail_level', 'Partikeldetails', 'Maximale Detailstufe von Partikeleffekten.', 'grafik', 'int', { min: 0, max: 3 }),
  video('r_particle_shadows', 'Partikelschatten', 'Schatten von Partikeln.', 'grafik', 'bool01', { options: onOff01 }),
  video('r_effects_bloom', 'Bloom (Effekte)', 'Leuchteffekt.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_post_bloom', 'Bloom (Nachbearbeitung)', 'Bloom in der Nachbearbeitung.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_depth_of_field', 'Tiefenschärfe', 'Unschärfe außerhalb des Fokus.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_citadel_motion_blur', 'Bewegungsunschärfe', 'Unschärfe bei Bewegung.', 'grafik', 'bool01', { options: onOff01 }),
  video('r_citadel_distancefield_shadows', 'Distanzfeld-Schatten', 'Zusätzliche Schatten über Distanzfelder.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_citadel_distancefield_reflections', 'Distanzfeld-Reflexionen', 'Reflexionen über Distanzfelder.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_citadel_half_res_noisy_effects', 'Rauschige Effekte in halber Auflösung', 'Rendert bestimmte Effekte in halber Auflösung.', 'grafik', 'boolword', { options: onOffWord }),
  video('r_texture_stream_mip_bias', 'Textur-Mip-Bias', 'Verschiebt Textur-Mip-Stufen. Hohe Werte = unschärfere Texturen.', 'erweitert', 'int', {
    min: 0,
    max: 8,
    note: 'Laut OptiLock-README erfordern Werte über 4 einen zusätzlichen Mod (Sinner’s Light Fix). CITADEL begrenzt den Bereich deshalb im einfachen Modus nicht, markiert Werte > 4 aber als Mod-abhängig.',
    evidence: [...VIDEO_EV, 'optilock-gameinfo'],
  }),

  // ---------- Gerätespezifisch (nie übernehmen) ----------
  video('knowndevice', 'Bekanntes Gerät', 'Interne Kennzeichnung des Grafikgeräts.', 'erweitert', 'bool01', { portable: false, applyPolicy: 'draft-only', group: 'geraet' }),
  video('recommendedheight', 'Empfohlene Höhe', 'Vom Spiel ermittelte Empfehlung.', 'erweitert', 'int', { portable: false, applyPolicy: 'draft-only', group: 'geraet' }),
  video('useadvanced', 'Erweiterte Einstellungen genutzt', 'Kennzeichen des Menüs.', 'erweitert', 'bool01', { options: onOff01 }),

  // ---------- Crosshair (autoexec.cfg) ----------
  crosshair('citadel_crosshair_color_r', 'Farbe Rot', 'int', '255', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_color_g', 'Farbe Grün', 'int', '255', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_color_b', 'Farbe Blau', 'int', '255', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_pip_gap', 'Linien-Abstand', 'float', '4', { min: -10, max: 50, step: 0.5 }),
  crosshair('citadel_crosshair_pip_gap_static', 'Statischer Abstand', 'boolword', 'false', { options: onOffWord }),
  crosshair('citadel_crosshair_pip_height', 'Linien-Länge', 'float', '16', { min: 0, max: 60, step: 0.5 }),
  crosshair('citadel_crosshair_pip_width', 'Linien-Breite', 'float', '2', { min: 0, max: 20, step: 0.5 }),
  crosshair('citadel_crosshair_pip_opacity', 'Linien-Deckkraft', 'float', '0.5', { min: 0, max: 1, step: 0.05 }),
  crosshair('citadel_crosshair_pip_outline_border', 'Linien-Kontur', 'float', '1', { min: 0, max: 6, step: 0.5 }),
  crosshair('citadel_crosshair_pip_outline_gap', 'Linien-Kontur-Abstand', 'float', '0', { min: 0, max: 6, step: 0.5 }),
  crosshair('citadel_crosshair_pip_outline_opacity', 'Linien-Kontur-Deckkraft', 'float', '0.7', { min: 0, max: 1, step: 0.05 }),
  crosshair('citadel_crosshair_dot_size', 'Punkt-Größe', 'float', '4', { min: 0, max: 30, step: 0.5 }),
  crosshair('citadel_crosshair_dot_opacity', 'Punkt-Deckkraft', 'float', '0.7', { min: 0, max: 1, step: 0.05 }),
  crosshair('citadel_crosshair_dot_outline_border', 'Punkt-Kontur', 'float', '2', { min: 0, max: 6, step: 0.5 }),
  crosshair('citadel_crosshair_dot_outline_gap', 'Punkt-Kontur-Abstand', 'float', '0', { min: 0, max: 6, step: 0.5 }),
  crosshair('citadel_crosshair_dot_outline_opacity', 'Punkt-Kontur-Deckkraft', 'float', '0.7', { min: 0, max: 1, step: 0.05 }),
  crosshair('citadel_crosshair_outline_color_r', 'Konturfarbe Rot', 'int', '0', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_outline_color_g', 'Konturfarbe Grün', 'int', '0', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_outline_color_b', 'Konturfarbe Blau', 'int', '0', { min: 0, max: 255 }),
  crosshair('citadel_crosshair_hit_marker_duration', 'Trefferanzeige-Dauer', 'float', '0.1', { min: 0, max: 2, step: 0.01 }),
  crosshair('citadel_crosshair_disable_hero_specific_crosshairs', 'Heldenspezifische Crosshairs aus', 'boolword', 'false', {
    options: onOffWord,
    note: 'Einige Helden nutzen eigene Reticles. Mit „An“ wird überall das eigene Crosshair gezeigt (laut Name; Wirkung ungeprüft).',
  }),

  // ---------- Maus (autoexec.cfg) ----------
  {
    id: 'cfg.sensitivity',
    label: 'Maus-Sensitivität',
    description: 'Ingame-Sensitivität. Standard laut ConVar-Liste: 1.25.',
    category: 'maus',
    group: 'eingabe',
    file: 'autoexec.cfg',
    key: 'sensitivity',
    type: 'float',
    min: 0.01,
    max: 20,
    step: 0.01,
    default: '1.25',
    portable: true,
    restartRequired: false,
    status: 'unverified',
    applyPolicy: 'direct',
    evidence: ['optilock-cvarlist'],
    note: 'Flag „per_user“: Das Spiel speichert den Wert auch selbst. Ein autoexec-Wert kann den Menüwert beim Start überschreiben.',
  },
  {
    id: 'cfg.zoom_sensitivity_ratio',
    label: 'Zoom-Sensitivität (Faktor)',
    description: 'Zusätzlicher Faktor beim Zoomen. Standard laut ConVar-Liste: 1.',
    category: 'maus',
    group: 'eingabe',
    file: 'autoexec.cfg',
    key: 'zoom_sensitivity_ratio',
    type: 'float',
    min: 0.01,
    max: 5,
    step: 0.01,
    default: '1',
    portable: true,
    restartRequired: false,
    status: 'unverified',
    applyPolicy: 'direct',
    evidence: ['optilock-cvarlist'],
  },
  {
    id: 'cfg.sensitivity_y_scale',
    label: 'Vertikaler Sensitivitätsfaktor',
    description: 'Multipliziert die vertikale Mausachse. Standard: 1.',
    category: 'maus',
    group: 'eingabe',
    file: 'autoexec.cfg',
    key: 'sensitivity_y_scale',
    type: 'float',
    min: 0.1,
    max: 3,
    step: 0.01,
    default: '1',
    portable: true,
    restartRequired: false,
    status: 'unverified',
    applyPolicy: 'direct',
    evidence: ['optilock-cvarlist'],
  },

  // ---------- Erweitert: gameinfo.gi ConVars (nur Entwurf) ----------
  {
    id: 'gi.citadel_camera_hero_fov',
    label: 'Kamera-FOV (Held)',
    description: 'Sichtfeld der Kamera, wenn sie einem Helden folgt. Standard laut ConVar-Liste: 90. Achse und Bezug (horizontal/vertikal) ungeprüft.',
    category: 'erweitert',
    group: 'anzeige',
    file: 'gameinfo.gi',
    key: 'citadel_camera_hero_fov',
    block: ['GameInfo', 'ConVars'],
    type: 'float',
    min: 60,
    max: 130,
    step: 1,
    default: '90',
    portable: true,
    restartRequired: true,
    status: 'unverified',
    applyPolicy: 'draft-only',
    evidence: ['optilock-cvarlist', 'optilock-gameinfo'],
    note: 'Nur Entwurf: Weg über gameinfo.gi ist nicht geprüft; Änderungen an gameinfo.gi werden bei Spielupdates überschrieben.',
  },
  {
    id: 'gi.r_aspectratio',
    label: 'Seitenverhältnis-Override',
    description: 'Erzwungenes Seitenverhältnis (0 = automatisch). Community nutzt es zur FOV-Änderung; keine heimliche Umrechnung.',
    category: 'erweitert',
    group: 'anzeige',
    file: 'gameinfo.gi',
    key: 'r_aspectratio',
    block: ['GameInfo', 'ConVars'],
    type: 'float',
    min: 0,
    max: 4,
    step: 0.01,
    default: '0',
    portable: true,
    restartRequired: true,
    status: 'unverified',
    applyPolicy: 'draft-only',
    evidence: ['optilock-cvarlist', 'optilock-gameinfo'],
  },
];

export const SETTINGS_BY_ID = new Map(SETTINGS.map((s) => [s.id, s]));

/** Kopf-Einträge der video.txt, die gerätespezifisch sind (keine setting.*-Schlüssel). */
export const VIDEO_DEVICE_KEYS = ['Version', 'VendorID', 'DeviceID'];

export function findSetting(file: ConfigFileKind, key: string): SettingDefinition | undefined {
  const k = key.toLowerCase();
  return SETTINGS.find((s) => s.file === file && s.key.toLowerCase() === k);
}

export function isDevicePortable(file: ConfigFileKind, key: string): boolean {
  if (file === 'video.txt' && VIDEO_DEVICE_KEYS.some((k) => k.toLowerCase() === key.toLowerCase())) return false;
  const def = findSetting(file, key);
  return def ? def.portable : true;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
  normalized?: string;
}

export function validateValue(def: SettingDefinition, raw: string): ValidationResult {
  const v = raw.trim();
  switch (def.type) {
    case 'bool01':
      return v === '0' || v === '1' ? { ok: true, normalized: v } : { ok: false, message: 'Erwartet 0 oder 1' };
    case 'boolword': {
      const l = v.toLowerCase();
      if (l === 'true' || l === 'false') return { ok: true, normalized: l };
      if (l === '1' || l === '0') return { ok: true, normalized: l === '1' ? 'true' : 'false' };
      return { ok: false, message: 'Erwartet true oder false' };
    }
    case 'int':
    case 'float': {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, message: 'Keine gültige Zahl' };
      const n = Number(v);
      if (def.type === 'int' && !Number.isInteger(n)) return { ok: false, message: 'Ganze Zahl erwartet' };
      if (def.min !== undefined && n < def.min) return { ok: false, message: `Mindestens ${def.min}` };
      if (def.max !== undefined && n > def.max) return { ok: false, message: `Höchstens ${def.max}` };
      if (def.options && !def.options.some((o) => o.value === v)) return { ok: false, message: 'Wert nicht in der Auswahlliste' };
      return { ok: true, normalized: v };
    }
    case 'enum':
      return def.options?.some((o) => o.value === v) ? { ok: true, normalized: v } : { ok: false, message: 'Wert nicht erlaubt' };
  }
}

/** Formatiert einen Wert im Stil der vorhandenen Datei (z. B. "1.000000" in video.txt). */
export function formatLike(existing: string | undefined, value: string, type: ValueType): string {
  if (type === 'float' && existing && /^-?\d+\.\d+$/.test(existing)) {
    const decimals = existing.split('.')[1].length;
    const n = Number(value);
    if (Number.isFinite(n)) return n.toFixed(decimals);
  }
  if ((type === 'bool01' || type === 'boolword') && existing) {
    const truthy = value === '1' || value === 'true';
    if (existing === '0' || existing === '1') return truthy ? '1' : '0';
    if (existing === 'true' || existing === 'false') return truthy ? 'true' : 'false';
  }
  return value;
}

export const CATEGORY_LABELS: Record<SettingCategory, string> = {
  anzeige: 'Anzeige',
  grafik: 'Grafik',
  sichtbarkeit: 'Sichtbarkeit',
  crosshair: 'Crosshair',
  maus: 'Maus',
  eingabe: 'Eingabe',
  audio: 'Audio',
  erweitert: 'Erweitert',
};

export const STATUS_LABELS: Record<SettingStatus, string> = {
  confirmed: 'bestätigt',
  unverified: 'noch ungeprüft',
  deprecated: 'veraltet',
  unsupported: 'nicht unterstützt',
};
