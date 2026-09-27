import type { ProviderPlayer, ProviderSnapshot, Team } from '../shared/types';
import type { FrameResult } from './frame';
import type { PortraitHit } from './hud';

// Macht aus einzelnen Bildauswertungen einen stabilen Matchzustand:
//  - eigener Hero: einziges Porträt (Sandbox) oder die Tab-Spalte, deren Items zum eigenen HUD passen;
//    sonst gemerkt oder aus der Einstellung
//  - Souls = große Zahl rechts vom Boon-Zähler, mit Ausreißerschutz. In der Sandbox steht dort
//    stattdessen „ITEM VALUE“ – dann gibt es kein Budget, aber eine Gegenprobe der erkannten Items
//  - Gegner = Porträts auf der anderen Bildhälfte; ihre Items nur, wenn die Tab-Spalte sichtbar war
//  - neues Match: Hero-Wechsel, Inventar fällt von mehreren Items auf leer, oder die Gegner sind andere

export type HeroSource = 'einziges Porträt' | 'Tab-Abgleich' | 'gemerkt' | 'Einstellung';

export interface TrackerStatus {
  hudVisible: boolean;
  lastFrameAt: number | null;
  frameMs: number | null;
  myHero: string | null;
  myHeroBy: HeroSource | null;
  souls: number | null;
  soulsText: string;
  boons: number | null;
  /** 'itemValue' = Sandbox-Anzeige statt Souls */
  lineKind: 'souls' | 'itemValue' | null;
  value: number | null;
  itemSum: number;
  valueCheck: 'ok' | 'teilweise' | 'abweichend' | 'nicht gelesen';
  items: string[];
  unknownSlots: number;
  portraits: string[];
  enemies: string[];
  tabSeen: Record<string, number>;
  matchSeq: number;
}

export interface TrackerOptions {
  costOf: (cls: string) => number;
  heroOverride?: string | null;
}

const SOULS_JUMP = 6000;

export class ScreenTracker {
  private matchSeq = 1;
  private myHero: string | null = null;
  private myHeroBy: HeroSource | null = null;
  private souls: number | null = null;
  private soulsPending: number | null = null;
  private lastItemCount = 0;
  private enemySet: string[] = [];
  private tabSeen: Record<string, number> = {};
  knownPortraits: PortraitHit[] = [];
  status: TrackerStatus;

  constructor(private opts: TrackerOptions) {
    this.status = this.blankStatus();
  }

  private blankStatus(): TrackerStatus {
    return { hudVisible: false, lastFrameAt: null, frameMs: null, myHero: null, myHeroBy: null, souls: null, soulsText: '', boons: null, lineKind: null, value: null, itemSum: 0, valueCheck: 'nicht gelesen', items: [], unknownSlots: 0, portraits: [], enemies: [], tabSeen: {}, matchSeq: this.matchSeq };
  }

  setHeroOverride(h: string | null) { this.opts.heroOverride = h; }

  private newMatch() {
    this.matchSeq++;
    this.souls = null; this.soulsPending = null; this.lastItemCount = 0;
    this.enemySet = []; this.tabSeen = {};
    if (this.myHeroBy !== 'Einstellung') { this.myHero = null; this.myHeroBy = null; }
  }

  get matchId() { return `screen-${this.matchSeq}`; }

  update(f: FrameResult, now: number): ProviderSnapshot | null {
    const st = this.status;
    st.lastFrameAt = now;
    st.frameMs = f.ms;
    st.hudVisible = !!f.hud;
    if (f.portraits.length) this.knownPortraits = f.portraits;
    st.portraits = f.portraits.map((p) => p.hero);
    if (!f.hud) return null;
    const hud = f.hud;

    // ---- eigener Hero ----
    let myIdx = -1;
    let heroBy: HeroSource | null = null;
    if (hud.items.length >= 2) {
      // Tab-Spalte mit (fast) denselben Items wie das eigene HUD
      let best = 0;
      for (const [i, col] of f.tab) {
        const a = new Set(hud.items), b = new Set(col.items);
        const inter = [...a].filter((x) => b.has(x)).length;
        const jac = inter / (a.size + b.size - inter || 1);
        if (jac >= 0.8 && jac > best) { best = jac; myIdx = i; heroBy = 'Tab-Abgleich'; }
      }
    }
    if (myIdx < 0 && f.portraits.length === 1) { myIdx = 0; heroBy = 'einziges Porträt'; }
    let hero: string | null = myIdx >= 0 ? f.portraits[myIdx]!.hero : null;
    if (this.opts.heroOverride) { hero = this.opts.heroOverride; heroBy = 'Einstellung'; }
    if (!hero && this.myHero && f.portraits.some((p) => p.hero === this.myHero)) { hero = this.myHero; heroBy = 'gemerkt'; }
    if (hero && myIdx < 0) myIdx = f.portraits.findIndex((p) => p.hero === hero);

    // ---- Match-Wechsel ----
    const isValue = hud.lineKind === 'itemValue';
    const value = isValue ? hud.line.value : null;
    const heroChanged = hero !== null && this.myHero !== null && hero !== this.myHero && heroBy !== 'gemerkt';
    const inventoryReset = this.lastItemCount >= 3 && hud.items.length === 0 && hud.unknownSlots === 0;
    const mySide = myIdx >= 0 ? this.sideOf(f.portraits[myIdx]!, f.width) : null;
    const enemies = mySide === null ? [] : f.portraits.filter((p) => this.sideOf(p, f.width) !== mySide).map((p) => p.hero);
    const enemyChanged = this.enemySet.length >= 3 && enemies.length >= 3 && enemies.filter((e) => !this.enemySet.includes(e)).length >= 3;
    if (heroChanged || inventoryReset || enemyChanged) this.newMatch();
    if (hero) { this.myHero = hero; this.myHeroBy = heroBy; }
    if (enemies.length) this.enemySet = enemies;
    this.lastItemCount = hud.items.length;

    // ---- Souls mit Ausreißerschutz (Kauf bis 6.400 → Bestätigung durch das nächste Bild) ----
    const s = isValue ? null : hud.line.value;
    if (isValue) { this.souls = null; this.soulsPending = null; }
    if (s !== null) {
      if (this.souls === null || Math.abs(s - this.souls) <= SOULS_JUMP) { this.souls = s; this.soulsPending = null; }
      else if (this.soulsPending !== null && Math.abs(s - this.soulsPending) <= 200) { this.souls = s; this.soulsPending = null; }
      else this.soulsPending = s;
    }

    // ---- Itemwert-Gegenprobe ----
    const sum = hud.items.reduce((a, i) => a + this.opts.costOf(i), 0);
    const check: TrackerStatus['valueCheck'] = value === null ? 'nicht gelesen' : value === sum ? 'ok' : value > sum && hud.unknownSlots > 0 ? 'teilweise' : 'abweichend';
    // Ohne Itemwert (normales Match) bleibt nur die Slot-Sicherheit
    const itemsComplete = hud.unknownSlots === 0 && check !== 'abweichend';

    Object.assign(st, {
      myHero: this.myHero, myHeroBy: this.myHeroBy, souls: this.souls, soulsText: isValue ? '' : hud.line.text, boons: hud.boons.value, lineKind: hud.lineKind, value, itemSum: sum, valueCheck: check,
      items: hud.items, unknownSlots: hud.unknownSlots, enemies, matchSeq: this.matchSeq,
    });

    // ---- Snapshot ----
    const myTeam: Team | undefined = mySide ?? undefined;
    const me: ProviderPlayer = { key: 'me', isMe: true, items: hud.items, itemsComplete };
    if (this.myHero) me.heroClass = this.myHero;
    if (myTeam !== undefined) me.team = myTeam;
    if (this.souls !== null && this.soulsPending === null) me.spendableSouls = this.souls;
    const players: ProviderPlayer[] = [me];
    f.portraits.forEach((p, i) => {
      if (i === myIdx || mySide === null) return;
      const pl: ProviderPlayer = { key: `screen:${p.hero}`, heroClass: p.hero, team: this.sideOf(p, f.width) };
      const col = f.tab.get(i);
      if (col) {
        pl.items = col.items;
        pl.itemsComplete = col.unknown === 0;
        this.tabSeen[p.hero] = now;
      }
      players.push(pl);
    });
    st.tabSeen = { ...this.tabSeen };
    return { source: 'screen', matchId: this.matchId, receivedAt: now, gameTime: null, sourceLagSec: 0, players, purchasesKnown: false };
  }

  private sideOf(p: PortraitHit, width: number): Team {
    return p.x + (35 * p.scale) < width / 2 ? 0 : 1;
  }
}
