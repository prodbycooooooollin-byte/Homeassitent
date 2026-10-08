/* Live-Coach: leitet aus dem Verlauf eines laufenden Matches (Spielzeit, Souls, Objectives) Empfehlungen ab.
 * Reine Regeln, bewusst vorsichtig formuliert – der Coach kennt keine Positionen und keine Cooldowns und kann danebenliegen. */

export interface CoachSnap {
  /** Spielzeit in Sekunden */
  t: number;
  /** Souls-Vorsprung deines Teams (negativ = Rückstand), null wenn unbekannt */
  diff: number | null;
  /** zerstörte Objectives: dein Team / Gegner (jeweils die eigenen Gebäude, die gefallen sind, laut API-Maske) – null wenn unbekannt */
  objMine: number | null;
  objEnemy: number | null;
}

export interface CoachCtx {
  /** Name des gefährlichsten Gegners (Scouting) */
  threat?: string;
  /** Anzahl aggressiver Gegner */
  aggroEnemies?: number;
  smurfEnemy?: string;
}

export type Urgency = "now" | "soon" | "info";
export interface Call { id: string; icon: string; title: string; why: string; urgency: Urgency }
export interface CoachEvent { id: string; t: number; icon: string; text: string; tone: "good" | "bad" | "info" }
export interface CoachOut { main: Call; others: Call[]; events: CoachEvent[] }

const k = (n: number) => `${(Math.abs(n) / 1000).toFixed(1).replace(".", ",")}k`;
const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Ereignisse zwischen zwei Abfragen (Objective gefallen, Führung gewechselt, große Souls-Verschiebung). */
export function detectEvents(prev: CoachSnap | null, cur: CoachSnap): CoachEvent[] {
  if (!prev) return [];
  const out: CoachEvent[] = [];
  const at = mm(cur.t);
  if (prev.objEnemy !== null && cur.objEnemy !== null && cur.objEnemy > prev.objEnemy) out.push({ id: `oe${cur.objEnemy}`, t: cur.t, icon: "tower", text: `${at} · Gegnerisches Objective gefallen (${cur.objEnemy} insgesamt) – Druck halten`, tone: "good" });
  if (prev.objMine !== null && cur.objMine !== null && cur.objMine > prev.objMine) out.push({ id: `om${cur.objMine}`, t: cur.t, icon: "tower", text: `${at} · Ein eigenes Objective ist gefallen (${cur.objMine} insgesamt) – absichern`, tone: "bad" });
  if (prev.diff !== null && cur.diff !== null) {
    if (prev.diff < 0 && cur.diff > 0) out.push({ id: `lead+${Math.floor(cur.t / 30)}`, t: cur.t, icon: "trendUp", text: `${at} · Ihr habt die Souls-Führung übernommen`, tone: "good" });
    if (prev.diff > 0 && cur.diff < 0) out.push({ id: `lead-${Math.floor(cur.t / 30)}`, t: cur.t, icon: "trendDown", text: `${at} · Die Gegner haben die Souls-Führung übernommen`, tone: "bad" });
    const d = cur.diff - prev.diff;
    if (Math.abs(d) >= 2500) out.push({ id: `sw${Math.floor(cur.t / 20)}`, t: cur.t, icon: d > 0 ? "bolt" : "alert", text: `${at} · ${d > 0 ? "Gewonnener Kampf/Push" : "Verlorener Kampf/Push"}: ${d > 0 ? "+" : "−"}${k(d)} Souls-Verschiebung`, tone: d > 0 ? "good" : "bad" });
  }
  return out;
}

/** Empfehlungen für den aktuellen Zustand, wichtigste zuerst. */
export function advise(history: CoachSnap[], ctx: CoachCtx = {}): { main: Call; others: Call[] } {
  const cur = history[history.length - 1];
  const calls: (Call & { w: number })[] = [];
  const add = (w: number, id: string, icon: string, title: string, why: string, urgency: Urgency = "info") => calls.push({ w, id, icon, title, why, urgency });
  if (!cur) return { main: { id: "wait", icon: "clock", title: "Warte auf Live-Daten …", why: "Sobald das Match läuft, bekommst du hier Empfehlungen.", urgency: "info" }, others: [] };
  const t = cur.t, diff = cur.diff;
  // Trend: Veränderung des Vorsprungs in den letzten ~2 Minuten
  const ref = [...history].reverse().find((h) => cur.t - h.t >= 120 && h.diff !== null);
  const trend = ref && diff !== null && ref.diff !== null ? diff - ref.diff : null;

  if (t < 150) add(60, "start", "flag", "Lane beziehen und Creeps sichern", "Die ersten Minuten entscheiden über den Souls-Start: früh an der Lane sein, Orbs nicht liegen lassen.", "now");
  else if (t < 480) {
    add(50, "lane", "sword", "Lane sauber farmen: Last Hits und Denies", "Bis etwa Minute 8 kommen die meisten Souls aus den Creeps. Nicht auf Trades einlassen, wenn der Gegner mehr Leben hat.", "now");
    if ((ctx.aggroEnemies ?? 0) >= 2) add(58, "aggro", "shield", `Gegner spielen aggressiv (${ctx.aggroEnemies}×)`, "Früh defensiv bleiben, Cooldowns merken und mit dem Lane-Partner gemeinsam stehen.", "now");
  }
  if (t >= 420 && t < 600) add(55, "rotate", "swap", "Rotation vorbereiten", "Die Lane-Phase endet: Camps und den ersten Guardian im Auge behalten, bevor das Team sich verteilt.", "soon");
  if (t >= 540 && t < 900 && (diff === null || diff > -3000)) add(48, "boss", "crown", "Mid-Boss im Blick behalten", "Ab etwa Minute 10 ist der Mid-Boss ein großer Hebel. Nur mit dem Team und ohne großen Soul-Rückstand angehen.", "soon");
  if (diff !== null) {
    if (diff >= 4000 && t >= 600) add(80, "lead", "tower", "Vorsprung in Objectives ummünzen", `Ihr seid ${k(diff)} Souls vorn: Walker/Guardian pushen und den Gegnern keine Ruhe zum Farmen lassen.`, "now");
    else if (diff >= 1500 && t >= 480) add(52, "lead-small", "trendUp", "Leichter Vorsprung: Druck erhöhen", `${k(diff)} Souls vorn – Tempo nutzen, bevor die Gegner aufholen.`, "soon");
    if (diff <= -4000) add(82, "behind", "shield", "Rückstand: Teamfights meiden, sicher farmen", `${k(diff)} Souls zurück – Kämpfe in Engstellen vermeiden, Camps und Kisten nehmen und auf gegnerische Fehler warten.`, "now");
    else if (diff <= -1500 && t >= 480) add(56, "behind-small", "alert", "Leicht im Rückstand: nicht allein spielen", `${k(diff)} Souls zurück – in der Gruppe bleiben und Flanken vermeiden.`, "soon");
  }
  if (trend !== null && trend <= -2000) add(85, "melting", "trendDown", "Dein Vorsprung schmilzt", `In den letzten Minuten ${k(trend)} Souls verloren – Fehler im Kampf prüfen, zusammenbleiben.`, "now");
  if (trend !== null && trend >= 2500) add(60, "surge", "bolt", "Ihr seid im Aufwind", `+${k(trend)} Souls in den letzten Minuten – jetzt nachsetzen statt zurückziehen.`, "soon");
  if (cur.objEnemy !== null && cur.objMine !== null) {
    if (cur.objEnemy - cur.objMine >= 2) add(64, "obj-lead", "tower", "Ihr habt mehr Objectives gebrochen", "Haltet den Druck auf die nächste Lane und baut den Vorteil aus.", "soon");
    if (cur.objMine - cur.objEnemy >= 2) add(66, "obj-behind", "tower", "Eigene Gebäude fallen", "Verteidigt die nächste Lane gemeinsam, bevor weitere Objectives verloren gehen.", "now");
  }
  if (ctx.smurfEnemy) add(40, "smurf", "alert", `${ctx.smurfEnemy} wirkt wie ein Smurf`, "Nicht unterschätzen – in der Lane nicht 1-gegen-1 überziehen.", "info");
  else if (ctx.threat) add(30, "threat", "target", `Größte Gefahr: ${ctx.threat}`, "Cooldowns merken und nicht allein begegnen.", "info");
  if (t >= 1800) add(62, "late", "hourglass", "Lategame: Respawns sind lang", "Jeder Tod kostet jetzt viel Zeit – nicht allein flankieren, Patron nur mit sicherem Vorteil angehen.", "soon");
  if (!calls.length) add(10, "calm", "eye", "Ruhige Phase", "Farme weiter und halte die Minimap im Blick.", "info");

  calls.sort((a, b) => b.w - a.w);
  const strip = ({ w: _w, ...c }: Call & { w: number }): Call => c;
  return { main: strip(calls[0]), others: calls.slice(1, 4).map(strip) };
}
