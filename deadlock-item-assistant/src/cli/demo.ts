import * as path from 'node:path';
import { Catalog } from '../gamedata/catalog';
import { Engine } from '../engine/engine';
import { DEMO_SCENARIOS, DemoProvider } from '../providers/demo';

// Terminal-Demo (Beispieldaten): zeigt Empfehlungen und Hinweise über den Verlauf eines Demo-Szenarios.
const cat = Catalog.load(path.join(__dirname, '..', '..', 'data'));
const id = process.argv[2] ?? DEMO_SCENARIOS[0].id;
const demo = new DemoProvider(cat, id);
const engine = new Engine(cat);
let now = Date.now();
demo.on('snapshot', (s) => {
  now += 1000;
  const { output: o, alerts } = engine.ingest({ ...s, receivedAt: now }, now);
  const f = (r: typeof o.buyNow) => (r ? `${cat.itemName(r.item!)} (${r.price}${r.missing ? `, fehlen ${r.missing}` : ''}) – ${r.reasonShort}` : '–');
  console.log(`[DEMO t=${Math.round(s.gameTime ?? 0)}s] ${o.primary === 'save' ? 'SPAREN' : 'KAUFEN'} | Jetzt: ${f(o.buyNow)} | Ziel: ${f(o.saveFor)}`);
  if (o.swap) console.log(`   Austausch: ${cat.itemName(o.swap.sell)} → ${cat.itemName(o.swap.buy)} (netto ${o.swap.netCost})`);
  for (const a of alerts) console.log(`   ⚑ ${a.heroName}: ${a.items.map((i) => cat.itemName(i)).join(', ')} ${a.wording}. ${a.consequence}${a.changedRecommendation ? ` ${a.changedRecommendation}` : ''}`);
});
console.log(`DEMO-Szenario: ${demo.scenario.title} – ${demo.scenario.description}`);
demo.emit('snapshot', demo.snapshot());
for (let i = 0; i < 40; i++) {
  demo.step(5);
  const o = engine.last;
  if (demo.autoBuy && o && o.primary === 'buy' && o.buyNow?.item && o.buyNow.affordable === 'yes') demo.buyMine(o.buyNow.item, o.swap?.buy === o.buyNow.item ? o.swap.sell : undefined);
}
