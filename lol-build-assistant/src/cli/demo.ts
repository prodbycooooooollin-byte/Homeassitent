// Demonstrierbare Partie-Simulation im Terminal (ohne Electron):
//   npm run demo -- [szenario-id] [--details]
// Spielt die Zeitleiste eines Szenarios ab und zeigt pro Schritt, was das
// Overlay anzeigen würde – inkl. "Warum geändert?".

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Advisor } from '../engine/advisor';
import { buildEngineInput } from '../engine/input';
import { loadData } from '../patch/patchData';
import { buildViewModel } from '../present/viewModel';
import { type SimScenario, simToMatchState } from '../sim/simulation';
import { DEFAULT_SETTINGS } from '../shared/types';

const root = path.resolve(__dirname, '..', '..');
const dataDir = path.join(root, 'data');
const simDir = path.join(dataDir, 'sim');
const args = process.argv.slice(2);
const details = args.includes('--details');
const id = args.find((a) => !a.startsWith('--'));
const files = fs.readdirSync(simDir).filter((f) => f.endsWith('.json'));
const scenarios = files.map((f) => JSON.parse(fs.readFileSync(path.join(simDir, f), 'utf8')) as SimScenario);
const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0];
if (!id) console.log(`Verfügbare Szenarien: ${scenarios.map((s) => s.id).join(', ')}\n`);

const data = loadData(dataDir, scenario.gameVersion ?? null);
const settings = { ...DEFAULT_SETTINGS };
const advisor = new Advisor(data, settings);
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const gold = (s: string) => `\x1b[33m${s}\x1b[0m`;

console.log(bold(`SIMULATION: ${scenario.name}`));
if (scenario.description) console.log(dim(scenario.description));
console.log(dim(data.status.message));

const steps = scenario.timeline ?? [];
for (let step = -1; step < steps.length; step++) {
  const label = step < 0 ? 'Ausgangszustand' : steps[step].label;
  const state = simToMatchState(scenario, { step, manual: [] });
  // Zwei Takte je Schritt, wie zwei Poll-Zyklen im Live-Betrieb (Stabilitätsprüfung).
  let out = null;
  let last = null;
  for (let tick = 0; tick < settings.stabilityPolls; tick++) {
    const input = buildEngineInput(state, settings, {}, data.status)!;
    out = advisor.update(input);
    if (out.lastChange) last = out.lastChange;
  }
  const vm = buildViewModel(out, state, data, settings, { ddVersion: '16.19.1' });
  console.log('\n' + gold(`— ${Math.floor(state.gameTime / 60)}:${String(state.gameTime % 60).padStart(2, '0')} ${label}`));
  if (vm.message) { console.log(vm.message); continue; }
  if (vm.favorite) {
    console.log(`${bold('Bevorzugt:')} ${vm.favorite.name}${vm.favorite.changed ? gold('  [GEÄNDERT]') : ''} – ${vm.favorite.tempo}`);
    for (const r of vm.favorite.reasons) console.log(`   › ${r}`);
  }
  if (vm.components) console.log(`${bold('Budget:')} ${vm.components.text}`);
  if (vm.components?.interim) console.log(`${bold('Option:')} ${vm.components.interim}`);
  for (const a of vm.alternatives) console.log(`${bold('Alternative:')} ${a.name} (${a.advantage}) – ${a.text}`);
  if (vm.pending) console.log(dim(vm.pending));
  if (last) {
    console.log(`${bold('Verlauf:')} ${last.summary}`);
    for (const d of last.decisive) console.log(`   Einfluss: ${d}`);
    if (!last.decisive.length) for (const t of last.triggers) console.log(dim(`   Beobachtung: ${t}`));
    if (last.tradeoff) console.log(dim(`   Trade-off: ${last.tradeoff}`));
  }
  if (details && vm.expanded) {
    console.log(dim('   Vorschau: ' + vm.expanded.preview.map((p) => p.name).join(' → ')));
    for (const c of vm.expanded.comparison) console.log(dim(`   ${c.highlight ? '*' : ' '} ${c.name.padEnd(28)} Schaden ${c.offense.padStart(6)}  eff. LP ${c.defense.padStart(6)}  Wert ${c.score}`));
    for (const w of vm.expanded.whyNot.slice(0, 4)) console.log(dim(`   Warum nicht ${w.name}? ${w.text}`));
    if (vm.expanded.robust) console.log(dim(`   ${vm.expanded.robust}`));
  }
}
