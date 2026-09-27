import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GameDataManifest, GameDataSet, HeroDef, ItemDef } from '../shared/gamedata';
import { type HeroSignals, deriveHeroSignals } from './heroSignals';
import { type CuratedEffect, type Effect, type EffectKind, effectsOf } from './mechanics';

// Patchgebundener Katalog: Items, Heroes, abgeleitete Effekte/Signale und Regeln.

export interface RuleValue<T> { value: T; status: 'verified' | 'reported' | 'assumed'; source: string }
export interface Rules {
  forBuild: number;
  sellRefundFraction: RuleValue<number>;
  baseSlots: RuleValue<number>;
  extraSlotsMax: RuleValue<number>;
  activeSlots: RuleValue<number>;
  columnLockedSlots: RuleValue<boolean>;
  componentDiscount: RuleValue<string>;
}

export interface HeroProfile {
  scaling: 'weapon' | 'spirit' | 'hybrid' | 'melee';
  damageMix: { bullet: number; spirit: number; melee: number };
  range: 'close' | 'mid' | 'long';
  confidence: 'high' | 'medium' | 'low';
}

export interface KnowledgeFiles {
  rules: Rules;
  effects: { forBuild: number; items: Record<string, CuratedEffect[]> };
  heroProfiles: { forBuild: number; heroes: Record<string, HeroProfile> };
}

export class Catalog {
  readonly manifest: GameDataManifest;
  readonly items = new Map<string, ItemDef>();
  readonly heroes = new Map<string, HeroDef>();
  readonly heroById = new Map<number, HeroDef>();
  readonly itemById = new Map<number, string>();
  readonly effects = new Map<string, Effect[]>();
  readonly heroSignals = new Map<string, HeroSignals>();
  /** Item → Items, die es als Komponente verbrauchen */
  readonly upgradesOf = new Map<string, string[]>();
  readonly rules: Rules;
  readonly profiles: Record<string, HeroProfile>;
  /** Items mit kuratierten Effekten, die im aktuellen Build nicht mehr passen */
  readonly unverifiedMechanics: string[] = [];
  readonly knowledgeBuildMismatch: boolean;
  language = 'english';

  constructor(data: GameDataSet, knowledge: KnowledgeFiles) {
    this.manifest = data.manifest;
    this.rules = knowledge.rules;
    this.profiles = knowledge.heroProfiles.heroes;
    this.knowledgeBuildMismatch = [knowledge.rules.forBuild, knowledge.effects.forBuild, knowledge.heroProfiles.forBuild]
      .some((b) => b !== data.manifest.build);
    for (const it of data.items) {
      this.items.set(it.className, it);
      if (it.id !== undefined) this.itemById.set(it.id, it.className);
    }
    for (const it of data.items) {
      for (const c of it.components) {
        const list = this.upgradesOf.get(c) ?? [];
        list.push(it.className);
        this.upgradesOf.set(c, list);
      }
      const eff = effectsOf(it, knowledge.effects.items[it.className]);
      this.effects.set(it.className, eff);
      if (eff.some((e) => !e.verified)) this.unverifiedMechanics.push(it.className);
    }
    for (const k of Object.keys(knowledge.effects.items)) if (!this.items.has(k)) this.unverifiedMechanics.push(k);
    for (const h of data.heroes) {
      this.heroes.set(h.className, h);
      this.heroById.set(h.heroId, h);
      this.heroSignals.set(h.className, deriveHeroSignals(h));
    }
  }

  static load(dataDir: string): Catalog {
    const j = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(dataDir, p), 'utf8')) as T;
    const data: GameDataSet = { manifest: j('gamedata/manifest.json'), items: j('gamedata/items.json'), heroes: j('gamedata/heroes.json') };
    const localized = path.join(dataDir, 'gamedata', 'localized.json');
    const cat = new Catalog(data, { rules: j('knowledge/rules.json'), effects: j('knowledge/effects.json'), heroProfiles: j('knowledge/hero-profiles.json') });
    if (fs.existsSync(localized)) cat.applyLocalization(JSON.parse(fs.readFileSync(localized, 'utf8')));
    return cat;
  }

  /** Übernimmt Namen/IDs aus einem Assets-Sync (z. B. api.deadlock-api.com/v1/assets/items?language=german). */
  applyLocalization(loc: { language: string; items?: Record<string, { name?: string; id?: number; image?: string }>; heroes?: Record<string, { name?: string; image?: string }> }) {
    for (const [cls, v] of Object.entries(loc.items ?? {})) {
      const it = this.items.get(cls);
      if (!it) continue;
      if (v.name) it.nameLocalized = { ...(it.nameLocalized ?? {}), [loc.language]: v.name };
      if (v.id !== undefined) {
        if (it.id !== undefined && this.itemById.get(it.id) === cls) this.itemById.delete(it.id);
        it.id = v.id; it.idSource = 'assets-sync'; this.itemById.set(v.id, cls);
      }
      if (v.image) it.imageUrl = v.image;
    }
    for (const [cls, v] of Object.entries(loc.heroes ?? {})) {
      const h = this.heroes.get(cls);
      if (!h) continue;
      if (v.name) h.nameLocalized = { ...(h.nameLocalized ?? {}), [loc.language]: v.name };
      if (v.image) h.imageUrl = v.image;
    }
  }

  item(cls: string): ItemDef | undefined { return this.items.get(cls); }

  /** Offizieller Name in der gewählten Sprache; ohne Sync der englische Originalname (keine eigene Übersetzung). */
  itemName(cls: string): string {
    const it = this.items.get(cls);
    if (!it) return cls;
    return it.nameLocalized?.[this.language] ?? it.nameEn;
  }

  heroName(cls: string | null | undefined): string {
    if (!cls) return 'Unbekannt';
    const h = this.heroes.get(cls);
    return h ? h.nameLocalized?.[this.language] ?? h.nameEn : cls;
  }

  heroByAnyId(heroClass?: string, heroId?: number): string | null {
    if (heroClass && this.heroes.has(heroClass)) return heroClass;
    if (heroId !== undefined) return this.heroById.get(heroId)?.className ?? null;
    return null;
  }

  effectStrength(cls: string, kind: EffectKind): number {
    return (this.effects.get(cls) ?? []).filter((e) => e.kind === kind).reduce((s, e) => s + e.strength, 0);
  }

  isMechanicVerified(cls: string): boolean { return !this.unverifiedMechanics.includes(cls); }

  /** Alle (transitiven) Komponenten eines Items */
  componentTree(cls: string, seen = new Set<string>()): string[] {
    const it = this.items.get(cls);
    if (!it) return [];
    const out: string[] = [];
    for (const c of it.components) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c, ...this.componentTree(c, seen));
    }
    return out;
  }
}
