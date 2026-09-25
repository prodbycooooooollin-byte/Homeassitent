import type { AdvisorOutput, ChangeRecord } from '../engine/advisor';
import type { EvaluationResult } from '../engine/engine';
import { alternativeText, optionReasons, tempoText, whyNot } from '../engine/explain';
import type { LoadedData } from '../patch/patchData';
import { itemDisplayName } from '../patch/patchData';
import type { AdvisorSettings, MatchState } from '../shared/types';

export interface ItemChip { itemId: number; name: string; icon: string; cost?: number }

export interface OverlayVM {
  mode: 'live' | 'simulation' | 'waiting';
  status: { label: string; tone: 'ok' | 'warn' | 'error'; detail: string };
  patch: { label: string; restricted: boolean };
  champion: { name: string; playstyle: string; role: string; focus: string; support: string } | null;
  message: string | null;
  favorite: (ItemChip & { tempo: string; reasons: string[]; pinned: boolean; changed: boolean; confidence: string }) | null;
  components: { mode: string; text: string; items: ItemChip[]; interim: string | null } | null;
  alternatives: (ItemChip & { advantage: string; text: string })[];
  pending: string | null;
  lastUpdate: string;
  expanded: {
    preview: ItemChip[];
    enemies: { name: string; items: ItemChip[]; unknown: number; weight: string; threat: string; stats: string; source: string; notes: string[] }[];
    comparison: { name: string; offense: string; defense: string; utility: string; tempo: string; score: string; highlight: boolean }[];
    changes: { time: string; summary: string; triggers: string[]; decisive: string[]; tradeoff: string; kind: ChangeRecord['kind'] }[];
    whyNot: { name: string; text: string }[];
    quality: string[];
    assumptions: string[];
    robust: string | null;
    threat: string;
    sell: string | null;
  } | null;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function iconUrl(itemId: number, ddVersion: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${itemId}.png`;
}

const FOCUS: Record<string, string> = { frontline: 'Frontline', backline: 'Backline', balanced: 'Ausgewogen' };

export function buildViewModel(
  out: AdvisorOutput | null,
  state: MatchState | null,
  data: LoadedData,
  settings: AdvisorSettings,
  opts: { ddVersion: string; now?: number; waitingReason?: string },
): OverlayVM {
  const now = opts.now ?? Date.now();
  const chip = (id: number, cost?: number): ItemChip => ({ itemId: id, name: itemDisplayName(data.patch.items.get(id), id), icon: iconUrl(id, opts.ddVersion), cost });
  const patch = { label: data.status.level === 'validated' ? `Patch ${data.status.gameVersion} geprüft` : data.status.level === 'version-unknown' ? 'Spielversion unbekannt' : `Daten: ${data.status.datasetId} (ungeprüft)`, restricted: data.status.restricted };

  if (!state || !out) {
    return {
      mode: 'waiting', status: { label: 'Warte auf Partie', tone: 'warn', detail: opts.waitingReason ?? 'Live Client Data API nicht erreichbar' },
      patch, champion: null, message: 'Die App wartet auf eine laufende Partie (Port 2999).', favorite: null, components: null,
      alternatives: [], pending: null, lastUpdate: '–', expanded: null,
    };
  }
  const age = state.feed.lastSuccessAt ? Math.round((now - state.feed.lastSuccessAt) / 1000) : null;
  const status: OverlayVM['status'] = state.mode === 'simulation'
    ? { label: 'SIMULATION', tone: 'warn', detail: 'Manuell/Szenario – keine Live-Daten' }
    : state.feed.status === 'live' ? { label: 'Live', tone: 'ok', detail: `Daten ${age ?? 0} s alt` }
      : state.feed.status === 'stale' ? { label: 'Veraltet', tone: 'error', detail: `Letzter gültiger Stand vor ${age} s (${state.feed.error ?? 'Verbindung'})` }
        : state.feed.status === 'ended' ? { label: 'Partie beendet', tone: 'warn', detail: 'Verbindung zum Spiel beendet' }
          : { label: state.feed.status, tone: 'warn', detail: state.feed.error ?? '' };
  const lastChange = out.history[out.history.length - 1];
  const lastUpdate = lastChange ? `${fmtTime(lastChange.gameTime)} Spielzeit` : fmtTime(state.gameTime);

  const res = out.result;
  if (!res.ok) {
    return {
      mode: state.mode, status, patch, champion: null, message: res.message, favorite: null, components: null,
      alternatives: [], pending: null, lastUpdate, expanded: null,
    };
  }
  const r: EvaluationResult = res;
  const fav = r.options.find((o) => o.itemId === r.bestId) ?? null;
  const changedRecently = !!lastChange && lastChange.kind === 'switch' && state.gameTime - lastChange.gameTime < 25;
  const favorite = fav ? {
    ...chip(fav.itemId), tempo: tempoText(fav), reasons: optionReasons(r, fav, 2),
    pinned: settings.pinnedItem === fav.itemId, changed: changedRecently,
    confidence: fav.confidence >= 0.85 ? 'hoch' : fav.confidence >= 0.65 ? 'mittel' : 'niedrig',
  } : null;
  const components = r.components ? {
    mode: r.components.mode, text: r.components.reason,
    items: r.components.buy.map((b) => chip(b.itemId, b.cost)),
    interim: r.interimCounters[0]?.reason ?? null,
  } : null;
  const alternatives = fav ? r.alternatives.map((a) => {
    const o = r.options.find((x) => x.itemId === a.itemId)!;
    return { ...chip(a.itemId), advantage: a.advantage, text: alternativeText(r, o, fav) };
  }) : [];
  const pending = out.pending ? `${out.pending.name} holt auf (+${Math.round(out.pending.lead * 100)} %), Wechsel nach Bestätigung (${out.pending.polls}/${settings.stabilityPolls})` : null;

  const t = r.threat;
  const topIds = new Set([r.bestId, ...r.alternatives.map((a) => a.itemId), ...r.options.slice(0, 4).map((o) => o.itemId)]);
  const comparison = r.options.filter((o) => topIds.has(o.itemId)).map((o) => ({
    name: o.name,
    offense: `${o.gains.offense >= 0 ? '+' : ''}${Math.round(o.gains.offense * 100)} %`,
    defense: `${o.gains.defense >= 0 ? '+' : ''}${Math.round(o.gains.defense * 100)} %`,
    utility: o.gains.utility > 0.005 ? `+${(o.gains.utility * 100).toFixed(0)} P.` : '–',
    tempo: tempoText(o),
    score: (o.pathScore * 100).toFixed(1),
    highlight: o.itemId === r.bestId,
  }));
  const quality: string[] = [...r.warnings];
  quality.push(`Gegnerinventare: ${settings.enemyItemPolicy === 'manual' && state.mode === 'live' ? 'manuelle Eingabe' : state.mode === 'simulation' ? 'Simulation' : 'Live Client (Anzeigeumfang des Clients)'}.`);
  quality.push(`Modellsicherheit des Favoriten: ${favorite?.confidence ?? '–'} (${Math.round((fav?.confidence ?? 0) * 100)} %).`);
  if (fav?.unmodeled.length) quality.push(`Nicht modelliert bei ${fav.name}: ${fav.unmodeled.join('; ')}.`);

  return {
    mode: state.mode, status, patch,
    champion: { name: r.championName, playstyle: r.playstyle.name, role: r.role ?? 'unbekannt', focus: FOCUS[r.focus], support: r.supportLevel === 'supported' ? 'unterstützt' : 'teilweise modelliert' },
    message: null, favorite, components, alternatives, pending, lastUpdate,
    expanded: {
      preview: r.preview.map((id) => chip(id)),
      enemies: r.enemies.map((e) => ({
        name: e.name,
        items: e.items.map((id) => chip(id)),
        unknown: e.unknownItems.length,
        weight: `${Math.round(e.targetWeight * 100)} %`,
        threat: e.threat.toFixed(2),
        stats: `~${Math.round(e.armor.value)} Rüstung (bis ${Math.round(e.armor.high)}), ~${Math.round(e.mr.value)} MR, ~${Math.round(e.hp.value)} LP`,
        source: e.itemsKnown ? `${e.itemsSource}${e.itemsAgeSec !== null ? `, ${Math.round(e.itemsAgeSec)} s alt` : ''}` : 'unbekannt',
        notes: e.notes,
      })),
      comparison,
      changes: [...out.history].reverse().slice(0, 12).map((c) => ({
        time: fmtTime(c.gameTime), summary: c.summary, triggers: c.triggers, decisive: c.decisive, tradeoff: c.tradeoff, kind: c.kind,
      })),
      whyNot: whyNot(r).map((w) => ({ name: w.name, text: w.text })),
      quality,
      assumptions: r.assumptions,
      robust: r.robust?.note ?? null,
      threat: `Bedrohung: ${Math.round(t.physical * 100)} % phys., ${Math.round(t.magic * 100)} % mag., ${Math.round(t.true * 100)} % abs.; Burst ${Math.round(t.burst * 100)} %; reinigbare harte CC ${Math.round(t.cleansableHardCc * 100)} %. Größte Bedrohungen: ${t.top.map((x) => `${x.name} (${x.threat.toFixed(2)}${x.notes.length ? ': ' + x.notes.join(', ') : ''})`).join('; ')}.`,
      sell: r.sellException ? `AUSNAHME (Verkauf): ${itemDisplayName(data.patch.items.get(r.sellException.sellId))} verkaufen für ${itemDisplayName(data.patch.items.get(r.sellException.buyId))} – modellierter Mehrwert +${Math.round(r.sellException.gain * 100)} %, Nettokosten ${r.sellException.netCost} g. Nur spät im Spiel sinnvoll; Entscheidung liegt bei dir.` : null,
    },
  };
}
