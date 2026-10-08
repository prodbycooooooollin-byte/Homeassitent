/** Aus einem Valve-Replay (.dem) extrahierte Daten – klein genug zum dauerhaften Speichern (ohne Replay-Datei selbst). */
export interface ReplayPlayer {
  accountId: number;
  name?: string;
  team: 0 | 1;
  heroId?: number;
  /** Lobby-Slot, falls im Replay erkennbar */
  slot?: number;
}

export interface ReplayDamage { heroId?: number; abilityId?: number; damage: number; hits?: number }

export interface ReplayKill {
  /** Replay-Zeit in Sekunden (nicht Spielzeit – siehe `alignClock`) */
  t: number;
  /** Index in `players` (-1 = unbekannt, z. B. NPC/Umgebung) */
  victim: number;
  attacker: number;
  assisters: number[];
  x?: number;
  y?: number;
  damage?: number;
  lostGold?: number;
  records?: ReplayDamage[];
}

export interface ReplayData {
  version: 1;
  matchId: number;
  /** Abstand der Messpunkte in Sekunden */
  step: number;
  /** Replay-Zeit des ersten Messpunkts */
  tStart: number;
  tickRate: number;
  players: ReplayPlayer[];
  /** Pro Spieler und Messpunkt: Position (Weltkoordinaten), Leben, lebendig (1/0) */
  x: number[][];
  y: number[][];
  hp: number[][];
  maxHp: number[][];
  alive: number[][];
  kills: ReplayKill[];
  /** Hilfsangaben für die Fehlersuche (gefundene Feldnamen, Zähler …) */
  diag?: Record<string, unknown>;
}

export type SceneKind = "death" | "kill" | "assist";

export interface SceneFact { key: string; text: string; tone: "good" | "bad" | "info" }

export interface Scene {
  id: string;
  kind: SceneKind;
  /** Spielzeit in Sekunden (nach Abgleich mit den Match-Daten) */
  t: number;
  /** Replay-Zeit in Sekunden */
  rt: number;
  /** Gegenspieler (Killer bzw. Opfer) als Index in `players` (-1 ohne Replay) */
  other: number;
  /** Held des Gegenspielers (immer gesetzt, wenn bekannt) */
  otherHero?: number;
  /** Analyse nur aus Match-Daten, ohne Replay (keine Positionen) */
  basic?: boolean;
  helpers: number[];
  headline: string;
  /** Warum? – 1 bis 3 Sätze aus den Fakten dieser Szene */
  why: string;
  /** Besser machen / Was war gut */
  advice: string;
  facts: SceneFact[];
  /** Hauptursache (für Zählung über viele Szenen) */
  cause: string;
  x?: number;
  y?: number;
}

export interface ReplayAnalysis {
  /** Spielzeit = Replay-Zeit − offset */
  offset: number;
  aligned: boolean;
  scenes: Scene[];
  /** Häufigkeit der Hauptursachen deiner Tode */
  causes: Record<string, number>;
}
