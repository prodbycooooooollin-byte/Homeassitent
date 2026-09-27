import type { Catalog, HeroProfile } from '../gamedata/catalog';
import type { EffectKind } from '../gamedata/mechanics';
import type { EnemyThreat, MatchState, NeedKey, NeedVector, PlayerState, Provenance, ThreatFactor } from '../shared/types';
import type { Weights } from './weights';

// Lagebild: eigener Zustand, Bedrohung je Gegner, daraus der Bedarfsvektor.

export const NEED_KEYS: NeedKey[] = ['bulletDefense', 'spiritDefense', 'meleeDefense', 'ccDefense', 'antiHeal', 'burstDefense', 'offense', 'mobility'];

const TIER_WEIGHT = [0, 0.05, 0.1, 0.2, 0.35];
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const sat = (x: number) => 1 - Math.exp(-Math.max(0, x));
const usable = <T>(o: { value: T | null; status: string }) => (o.status === 'observed' || o.status === 'stale' || o.status === 'derived') ? o.value : null;

export interface MyContext {
  player: PlayerState | null;
  heroClass: string | null;
  profile: HeroProfile | null;
  scaling: { W: number; S: number; M: number; provenance: Provenance };
  items: string[];
  itemsKnown: boolean;
  netWorth: number | null;
  expectedTier: number;
  ccExposure: number;
}

export interface Assessment {
  me: MyContext;
  enemies: PlayerState[];
  threats: EnemyThreat[];
  needs: NeedVector;
  /** gewichtete Resistenz/Zähigkeit der Gegner (0..1) */
  enemyBulletResist: number;
  enemySpiritResist: number;
  enemyTankiness: number;
  enemyCcImmunity: number;
  enemyAntiHeal: number;
  warnings: string[];
}

export function investment(cat: Catalog, items: string[]) {
  let weapon = 0, spirit = 0, vitality = 0;
  for (const i of items) {
    const it = cat.item(i);
    if (!it) continue;
    if (it.slot === 'weapon') weapon += it.cost; else if (it.slot === 'spirit') spirit += it.cost; else vitality += it.cost;
  }
  return { weapon, spirit, vitality, total: weapon + spirit + vitality };
}

function itemsOf(p: PlayerState): string[] { return usable(p.items) ?? []; }

export function sumEffect(cat: Catalog, items: string[], kind: EffectKind): number {
  return items.reduce((s, i) => s + cat.effectStrength(i, kind), 0);
}

function myContext(cat: Catalog, state: MatchState, w: Weights): MyContext {
  const player = state.myKey ? state.players[state.myKey] ?? null : null;
  const heroClass = player ? usable(player.heroClass) : null;
  const profile = heroClass ? cat.profiles[heroClass] ?? null : null;
  const items = player ? itemsOf(player) : [];
  const base = w.scaling[profile?.scaling ?? 'hybrid'];
  // Der eigene Build entwickelt die Skalierung automatisch weiter.
  const inv = investment(cat, items);
  const offInv = inv.weapon + inv.spirit;
  const alpha = Math.min(0.5, offInv / 10000);
  const scaling = offInv > 0
    ? { W: base.W * (1 - alpha) + alpha * (inv.weapon / offInv) * 1.2, S: base.S * (1 - alpha) + alpha * (inv.spirit / offInv) * 1.2, M: base.M, provenance: (alpha > 0.2 ? 'from-build' : 'curated') as Provenance }
    : { ...base, provenance: 'curated' as Provenance };
  const nw = player ? usable(player.netWorth) : null;
  const gt = usable(state.gameTime);
  const expectedTier = nw !== null ? clamp(1 + nw / 9000, 1, 4) : gt !== null ? clamp(1 + gt / 600, 1, 4) : 2;
  const ccExposure = profile ? ({ close: 1.15, mid: 1, long: 0.85 } as const)[profile.range] : 1;
  return { player, heroClass, profile, scaling, items, itemsKnown: player ? usable(player.items) !== null : false, netWorth: nw, expectedTier, ccExposure };
}

export function assess(cat: Catalog, state: MatchState, w: Weights, now: number): Assessment {
  const warnings: string[] = [];
  const me = myContext(cat, state, w);
  const myTeam = me.player ? usable(me.player.team) : null;
  const all = Object.values(state.players);
  const enemies = all.filter((p) => !p.isMe && myTeam !== null && usable(p.team) !== null && usable(p.team) !== myTeam);
  if (myTeam === null) warnings.push('Eigenes Team unbekannt – Gegner können nicht zugeordnet werden.');

  // Wirtschaft: beobachteter Gesamtwert, sonst Untergrenze aus bekannten Items
  const nwOf = (p: PlayerState): { v: number | null; prov: Provenance | null } => {
    const nw = usable(p.netWorth);
    if (nw !== null) return { v: nw, prov: 'observed' };
    const it = usable(p.items);
    if (it && it.length) return { v: investment(cat, it).total, prov: 'from-build' };
    return { v: null, prov: null };
  };
  const nws = all.map(nwOf).map((x) => x.v).filter((v): v is number => v !== null && v > 0);
  const avgNw = nws.length ? nws.reduce((a, b) => a + b, 0) / nws.length : null;

  const dmg = state.damageToMe.status === 'observed' ? state.damageToMe.value : null;
  const dmgTotal = dmg ? dmg.entries.reduce((s, e) => s + e.total, 0) : 0;
  const teamKills = enemies.reduce((s, p) => s + (usable(p.kills) ?? 0), 0);

  // Erste Runde: Rohbedrohung ohne Teamkontext
  const rows = enemies.map((p) => {
    const heroClass = usable(p.heroClass);
    const sig = heroClass ? cat.heroSignals.get(heroClass) : undefined;
    const prof = heroClass ? cat.profiles[heroClass] : undefined;
    const items = itemsOf(p);
    const factors: ThreatFactor[] = [];
    const nw = nwOf(p);
    const ratio = nw.v !== null && avgNw ? nw.v / avgNw : null;
    const econ = ratio !== null ? clamp(0.5 + 0.6 * Math.log2(ratio)) : null;
    const itemPower = usable(p.items) !== null ? clamp(items.reduce((s, i) => s + (TIER_WEIGHT[cat.item(i)?.tier ?? 0] ?? 0), 0) / 1.4) : null;
    const power = econ !== null && itemPower !== null ? 0.6 * econ + 0.4 * itemPower : econ ?? itemPower ?? 0.4;
    if (econ !== null) factors.push({ label: ratio! >= 1 ? `Wirtschaft ${Math.round((ratio! - 1) * 100)} % über Schnitt` : `Wirtschaft ${Math.round((1 - ratio!) * 100)} % unter Schnitt`, value: econ, provenance: nw.prov! });
    if (itemPower !== null) factors.push({ label: `Build-Stärke (${items.length} Items)`, value: itemPower, provenance: 'observed' });
    const kills = usable(p.kills), assists = usable(p.assists);
    const participation = kills !== null && teamKills > 0 ? clamp((kills + 0.5 * (assists ?? 0)) / (teamKills + 1)) : 0;
    if (kills !== null) factors.push({ label: `Kills/Assists ${kills}/${assists ?? '?'}`, value: participation, provenance: 'observed' });
    const dmgEntry = dmg?.entries.find((e) => e.playerKey === p.key);
    const dmgShare = dmg && dmgTotal > 0 ? (dmgEntry?.total ?? 0) / dmgTotal : null;
    if (dmgShare !== null) factors.push({ label: `Anteil Schaden gegen dich ${Math.round(dmgShare * 100)} %`, value: dmgShare, provenance: 'damage-window' });
    const reported = state.reportedProblems.filter((r) => r.enemyKey === p.key && now - r.at < 5 * 60_000);
    if (reported.length) factors.push({ label: `von dir gemeldet: ${reported.map((r) => r.kind).join(', ')}`, value: 1, provenance: 'reported' });

    // Schadensprofil: Heldendaten-Einschätzung, gemischt mit beobachteter Investition oder gemessenem Fenster
    let mix = prof ? { ...prof.damageMix } : { bullet: 0.5, spirit: 0.5, melee: 0 };
    let mixProv: Provenance = 'curated';
    const inv = investment(cat, items);
    const off = inv.weapon + inv.spirit;
    if (off > 0) {
      const a = Math.min(0.6, off / 8000);
      const bullet = mix.bullet * (1 - a) + a * (inv.weapon / off) * (1 - mix.melee);
      const spirit = mix.spirit * (1 - a) + a * (inv.spirit / off) * (1 - mix.melee);
      mix = { bullet, spirit, melee: mix.melee };
      if (a > 0.2) mixProv = 'from-build';
    }
    if (dmgEntry && dmgEntry.total > 0 && (dmgEntry.bullet !== undefined || dmgEntry.spirit !== undefined)) {
      const t = dmgEntry.total;
      mix = { bullet: (dmgEntry.bullet ?? 0) / t, spirit: (dmgEntry.spirit ?? 0) / t, melee: (dmgEntry.melee ?? 0) / t };
      mixProv = 'damage-window';
    }
    const norm = mix.bullet + mix.spirit + mix.melee || 1;
    mix = { bullet: mix.bullet / norm, spirit: mix.spirit / norm, melee: mix.melee / norm };

    // Kontrolle: Heldendaten + Items mit Kontrolleffekten
    const itemCc = items.reduce((s, i) => s + 0.35 * (cat.effectStrength(i, 'enemyStun') + cat.effectStrength(i, 'enemySilence') + cat.effectStrength(i, 'enemyDisarm')), 0);
    const ccStrength = clamp((sig?.ccStrength ?? 0.4) + itemCc, 0, 1.8);
    const ccTypes = [...(sig?.ccTypes.map((c) => c.type) ?? []), ...items.filter((i) => ['enemyStun', 'enemySilence', 'enemyDisarm'].some((k) => cat.effectStrength(i, k as EffectKind) > 0)).map((i) => cat.itemName(i))];

    // Heilung: Heldendaten + Heil-/Lebensraub-Items
    const sustainItems = items.filter((i) => cat.effectStrength(i, 'sustain') > 0.25);
    const sustain = clamp((sig?.sustain ?? 0.2) * 0.6 + sumEffect(cat, items, 'sustain') * 0.35);
    const sustainSources = [...(sig && sig.sustain > 0 ? ['Fähigkeiten'] : []), ...sustainItems.map((i) => cat.itemName(i))];

    const hasDmg = dmgShare !== null;
    const tw = w.threat;
    let raw = tw.power * power + tw.participation * participation + (hasDmg ? tw.damageToMe * dmgShare! : tw.damageToMe * power * 0.7);
    if (reported.length) raw += tw.reported;
    return { p, heroClass, power, raw, factors, mix, mixProv, ccStrength, ccTypes, sustain, sustainSources, nw, ratio, reported };
  });

  // Zweite Runde: Teamzusammenhang – Kontrolle eines schwachen Gegners ermöglicht Schaden der starken.
  const threats: EnemyThreat[] = rows.map((r) => {
    // Nur ein tatsächlich vorne liegender Mitspieler macht Kontrolle zum „Ermöglicher“.
    const strongestOther = Math.max(0, ...rows.filter((o) => o !== r).map((o) => o.power));
    const enabler = clamp((r.ccStrength / 1.5) * Math.max(0, strongestOther - 0.45) * 1.8);
    const threat = clamp(r.raw + w.threat.enabler * enabler * (1 - r.power * 0.5), w.threat.floor, 1);
    const factors = [...r.factors];
    if (enabler > 0.25) factors.push({ label: 'Kontrolle ermöglicht Schaden stärkerer Mitspieler', value: enabler, provenance: 'from-hero-data' });
    return {
      key: r.p.key, heroClass: r.heroClass, heroName: cat.heroName(r.heroClass), threat,
      economy: { netWorth: r.nw.v, ratioToAvg: r.ratio, source: r.nw.prov },
      damageMix: { ...r.mix, provenance: r.mixProv }, ccStrength: r.ccStrength, ccTypes: [...new Set(r.ccTypes)],
      sustain: r.sustain, sustainSources: r.sustainSources, enabler, factors,
    };
  }).sort((a, b) => b.threat - a.threat);

  // Bedarf
  const values = Object.fromEntries(NEED_KEYS.map((k) => [k, 0])) as Record<NeedKey, number>;
  const drivers = Object.fromEntries(NEED_KEYS.map((k) => [k, [] as { enemyKey: string; share: number }[]])) as NeedVector['drivers'];
  const acc = (k: NeedKey, key: string, x: number) => { values[k] += x; if (x > 0) drivers[k].push({ enemyKey: key, share: x }); };
  for (const t of threats) {
    acc('bulletDefense', t.key, t.threat * t.damageMix.bullet * 0.9);
    acc('spiritDefense', t.key, t.threat * t.damageMix.spirit * 0.9);
    acc('meleeDefense', t.key, t.threat * t.damageMix.melee * 0.9);
    acc('antiHeal', t.key, t.threat * t.sustain * 1.3 + (state.reportedProblems.some((p) => p.enemyKey === t.key && p.kind === 'sustain' && now - p.at < 300_000) ? 0.4 : 0));
    const burst = t.threat > 0.6 ? (t.threat - 0.6) * 1.6 : 0;
    const reportedBurst = state.reportedProblems.some((p) => p.enemyKey === t.key && p.kind === 'burst' && now - p.at < 300_000);
    acc('burstDefense', t.key, burst + (reportedBurst ? 0.45 : 0));
  }
  // Kontrolle: fast jeder Hero hat etwas CC – daher zählt die relevanteste Quelle voll, weitere abnehmend.
  const ccContrib = threats.map((t) => {
    const reportedCc = state.reportedProblems.some((p) => p.enemyKey === t.key && p.kind === 'cc' && now - p.at < 5 * 60_000);
    const rel = (0.15 + 0.85 * Math.max(t.threat, t.enabler)) ** 1.5;
    return { key: t.key, v: t.ccStrength * rel * 0.6 * me.ccExposure + (reportedCc ? 0.9 : 0) };
  }).sort((x, y) => y.v - x.v);
  ccContrib.forEach((c, i) => acc('ccDefense', c.key, c.v / (i + 1)));
  for (const k of NEED_KEYS) values[k] = sat(values[k]);
  values.offense = w.baseOffenseNeed;
  values.mobility = w.baseMobilityNeed;
  for (const k of NEED_KEYS) {
    const total = drivers[k].reduce((s, d) => s + d.share, 0) || 1;
    drivers[k] = drivers[k].map((d) => ({ ...d, share: d.share / total })).sort((a, b) => b.share - a.share);
  }

  // Gegnerische Verteidigung (für Resistenz-Durchdringung, Anti-Tank, eigene Kontrolle/Heilung)
  const tw = threats.reduce((s, t) => s + t.threat, 0) || 1;
  const byThreat = (f: (items: string[]) => number) => threats.reduce((s, t) => s + t.threat * f(itemsOf(state.players[t.key])), 0) / tw;
  const enemyBulletResist = clamp(byThreat((it) => sumEffect(cat, it, 'bulletResist')) / 1.5);
  const enemySpiritResist = clamp(byThreat((it) => sumEffect(cat, it, 'spiritResist')) / 1.5);
  const enemyTankiness = clamp(byThreat((it) => sumEffect(cat, it, 'health') + 0.5 * sumEffect(cat, it, 'bulletResist') + 0.5 * sumEffect(cat, it, 'spiritResist')) / 3);
  const enemyCcImmunity = clamp(byThreat((it) => sumEffect(cat, it, 'ccImmunity') + sumEffect(cat, it, 'ccCleanse')));
  const enemyAntiHeal = clamp(Math.max(0, ...threats.map((t) => sumEffect(cat, itemsOf(state.players[t.key]), 'antiHeal'))));

  if (enemies.length && enemies.every((e) => usable(e.items) === null)) warnings.push('Gegnerische Items unbekannt – Bedrohung nur aus Heldendaten/Wirtschaft geschätzt.');
  // Bedarfe mit belegter Ursache: vom Nutzer gemeldet oder aus dem Schadensfenster
  const focus = new Set<NeedKey>();
  const recent = state.reportedProblems.filter((p) => now - p.at < 5 * 60_000);
  for (const p of recent) focus.add(p.kind === 'cc' ? 'ccDefense' : p.kind === 'sustain' ? 'antiHeal' : 'burstDefense');
  if (dmg && dmgTotal > 0) {
    const top = threats.find((t) => t.damageMix.provenance === 'damage-window');
    if (top) focus.add(top.damageMix.bullet >= top.damageMix.spirit ? 'bulletDefense' : 'spiritDefense');
  }
  return { me, enemies, threats, needs: { values, drivers, focus: [...focus] }, enemyBulletResist, enemySpiritResist, enemyTankiness, enemyCcImmunity, enemyAntiHeal, warnings };
}
