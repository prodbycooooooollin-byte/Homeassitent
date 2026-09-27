import * as fs from 'node:fs';
import * as path from 'node:path';
import { Catalog } from '../gamedata/catalog';
import { SpectatorProvider, findActiveMatch } from '../providers/spectator';
import type { ProviderSnapshot } from '../shared/types';

// DATEN-PROTOTYP: verbindet sich mit einem Live-Events-Dienst und protokolliert
// nachvollziehbar, welche Daten für ein laufendes Match tatsächlich ankommen.
// Beantwortet die fünf Fragen aus dem Auftrag mit Messwerten statt Annahmen.
//
// Aufruf:  npm run probe -- --base http://localhost:3000 --match 12345678 --account 123456789 [--minutes 10]
//          npm run probe -- --find --account 123456789      (sucht in den aktiven Top-Matches)

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const cat = Catalog.load(path.join(__dirname, '..', '..', 'data'));

async function main() {
  const account = arg('account') ? Number(arg('account')) : null;
  if (process.argv.includes('--find')) {
    if (!account) throw new Error('--account fehlt');
    console.log(await findActiveMatch(account));
    return;
  }
  const base = arg('base') ?? 'http://localhost:3000';
  const match = arg('match');
  if (!match) throw new Error('--match fehlt');
  const minutes = Number(arg('minutes') ?? 10);
  const log: { at: number; gameTime: number | null; players: ProviderSnapshot['players'] }[] = [];
  const p = new SpectatorProvider(cat, { baseUrl: base, matchId: match, myAccountId: account, throttleMs: 1000 });
  const firstSeen = new Map<string, { at: number; gameTime: number | null }>();
  const changes: { key: string; item: string; kind: 'added' | 'removed'; at: number; gameTime: number | null }[] = [];
  let prev = new Map<string, Set<string>>();
  p.on('status', (d) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${d.state} ${d.detail}`));
  p.on('snapshot', (s: ProviderSnapshot) => {
    log.push({ at: s.receivedAt, gameTime: s.gameTime ?? null, players: s.players });
    const next = new Map<string, Set<string>>();
    for (const pl of s.players) {
      const items = new Set(pl.items ?? []);
      next.set(pl.key, items);
      if (!firstSeen.has(pl.key)) firstSeen.set(pl.key, { at: s.receivedAt, gameTime: s.gameTime ?? null });
      const before = prev.get(pl.key);
      if (before) {
        for (const i of items) if (!before.has(i)) changes.push({ key: pl.key, item: cat.itemName(i), kind: 'added', at: s.receivedAt, gameTime: s.gameTime ?? null });
        for (const i of before) if (!items.has(i)) changes.push({ key: pl.key, item: cat.itemName(i), kind: 'removed', at: s.receivedAt, gameTime: s.gameTime ?? null });
      }
    }
    prev = next;
  });
  p.start();
  await new Promise((r) => setTimeout(r, minutes * 60_000));
  p.stop();

  const last = log[log.length - 1];
  const me = last?.players.find((x) => x.isMe);
  const d = p.diagnostics();
  const report = {
    measuredAt: new Date().toISOString(), base, match, account, durationMin: minutes, snapshots: log.length, rawEvents: d.rawEvents,
    q1_meErkannt: me ? { hero: cat.heroName(me.heroClass), team: me.team } : 'NEIN – Account-ID nicht im Stream gefunden',
    q2_gegner: last?.players.filter((x) => me && x.team !== undefined && x.team !== me.team).map((x) => ({ hero: cat.heroName(x.heroClass), items: (x.items ?? []).map((i) => cat.itemName(i)), unbekannteIds: x.unknownItemIds })),
    q3_souls: 'Quelle liefert nur net_worth (m_iGoldNetWorth, Gesamtwert). Ausgebbare Souls: nicht enthalten.',
    q4_aenderungen: changes.slice(0, 200),
    q4_snapshotIntervallMs: d.intervalMsAvg,
    q5_ausfaelle: { fehler: d.errors, hinweise: d.notes, unbekannteItemIds: d.unknownItemIds },
    hinweis: 'Die Verzögerung gegenüber dem Spiel lässt sich nur mit parallel laufendem Spiel messen: Kaufzeitpunkt im Spiel notieren und mit q4_aenderungen vergleichen.',
  };
  const out = path.join(process.cwd(), `probe-${match}-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({ report, log }, null, 1));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Rohdaten: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
