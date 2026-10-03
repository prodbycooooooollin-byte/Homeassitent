import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKv, setValues, duplicates } from '../src/core/kv.ts';
import { parseCfg, setConvars, effectiveConvars } from '../src/core/cfg.ts';
import { applyToText, buildChangeSet, applicableText, importInto, readValues, explainConfig, detectKind, type LoadedFile } from '../src/core/config.ts';
import { decodeBytes, encodeText, UnsupportedEncodingError } from '../src/core/text.ts';
import { consoleCommand, decodeShareCode, encodeShareCode, fromConvars, OWN_PRESETS, parseCrosshairCommands, renderSvg, toSettingValues, validateCrosshair, CROSSHAIR_DEFAULTS } from '../src/core/crosshair.ts';
import { compareRuns, computeStats, parseFrameCsv, percentile } from '../src/core/benchmark.ts';
import { mixProfiles, createProfile, portableExport, importPortable } from '../src/core/profiles.ts';
import { cm360, eDpi } from '../src/core/sensitivity.ts';
import { comparePatch, snapshotState, canRestoreWholeFile } from '../src/core/patch.ts';
import { recommend, bottleneckHint } from '../src/core/recommendations.ts';
import type { HardwareSnapshot } from '../src/core/models.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

function loaded(kind: LoadedFile['kind'], text: string): LoadedFile {
  return { kind, path: kind, text, bom: false, sha256: 'x', readAt: new Date().toISOString(), exists: true };
}

test('KV: unveränderter Round-Trip ist byte-identisch', () => {
  for (const f of ['video.local.txt', 'gameinfo.gi']) {
    const t = fx(f);
    assert.equal(setValues(parseKv(t), []), t);
  }
});

test('video.txt: nur der Wert ändert sich, CRLF/Tabs/unbekannte Schlüssel bleiben erhalten', () => {
  const t = fx('video.local.txt');
  const out = applyToText('video.txt', t, [{ settingId: 'video.fps_max', value: '237' }]);
  const before = t.split('\r\n');
  const after = out.split('\r\n');
  assert.equal(before.length, after.length);
  const diff = before.map((l, i) => [l, after[i]]).filter(([a, b]) => a !== b);
  assert.deepEqual(diff, [['\t"setting.fps_max"\t\t"0"', '\t"setting.fps_max"\t\t"237"']]);
  assert.ok(out.includes('"setting.mystery_future_key"\t\t"7"'));
  // erneutes Einlesen konsistent
  assert.equal(readValues('video.txt', out).get('setting.fps_max')?.value, '237');
});

test('video.txt: Float-Format der Datei wird beibehalten', () => {
  const out = applyToText('video.txt', fx('video.local.txt'), [{ settingId: 'video.mat_viewportscale', value: '0.85' }]);
  assert.ok(out.includes('"setting.mat_viewportscale"\t\t"0.850000"'));
});

test('ungültige Werte werden abgelehnt', () => {
  assert.throws(() => applyToText('video.txt', fx('video.local.txt'), [{ settingId: 'video.mat_viewportscale', value: '9' }]), /Höchstens/);
  assert.throws(() => applyToText('video.txt', fx('video.local.txt'), [{ settingId: 'video.mat_vsync', value: 'ja' }]));
});

test('Import fremder video.txt: keine Gerätewerte, ungültige/unbekannte nicht übernommen, fehlende Schlüssel nicht angelegt', () => {
  const local = fx('video.local.txt');
  const rep = importInto('video.txt', local, fx('video.foreign.txt'), { groups: ['grafik', 'anzeige'] });
  const after = readValues('video.txt', rep.draftText);
  assert.equal(after.get('vendorid')?.value, '4318');
  assert.equal(after.get('deviceid')?.value, '9860');
  assert.equal(after.get('setting.defaultres')?.value, '2560');
  assert.ok(rep.skippedDevice.includes('VendorID') && rep.skippedDevice.includes('setting.defaultres'));
  assert.equal(after.get('setting.mat_vsync')?.value, '0');
  assert.equal(after.get('setting.r_citadel_shadow_quality')?.value, '0');
  assert.ok(rep.skippedNotInLocal.includes('setting.r_citadel_ssao'));
  assert.equal(after.has('setting.r_citadel_ssao'), false);
  assert.ok(rep.notAdopted.some((n) => n.key === 'setting.mat_viewportscale' && /Ungültig/.test(n.why)));
  assert.ok(rep.notAdopted.some((n) => n.key === 'setting.some_unknown_thing'));
  assert.equal(after.get('setting.mystery_future_key')?.value, '7');
});

test('Import nur Anzeige-Gruppe verändert keine Grafikwerte', () => {
  const rep = importInto('video.txt', fx('video.local.txt'), fx('video.foreign.txt'), { groups: ['anzeige'] });
  const after = readValues('video.txt', rep.draftText);
  assert.equal(after.get('setting.r_citadel_shadow_quality')?.value, '2');
  assert.equal(after.get('setting.mat_vsync')?.value, '0');
});

test('ChangeSet: Gerätekennung im Expertenmodus geändert → blockiert; Teilanwendung schreibt nur zulässige Werte', () => {
  const local = fx('video.local.txt');
  let draft = applyToText('video.txt', local, [{ settingId: 'video.mat_vsync', value: '0' }]);
  draft = draft.replace('"DeviceID"\t\t"9860"', '"DeviceID"\t\t"1234"');
  const cs = buildChangeSet([loaded('video.txt', local)], { 'video.txt': draft });
  const f = cs.files[0];
  assert.equal(f.applicable, false);
  assert.ok(f.items.find((i) => i.key === 'DeviceID')?.blocked?.reason === 'device-specific');
  const safe = applicableText(f)!;
  assert.equal(readValues('video.txt', safe).get('deviceid')?.value, '9860');
  assert.equal(readValues('video.txt', safe).get('setting.mat_vsync')?.value, '0');
});

test('gameinfo.gi: FOV nur als Entwurf, Struktur außerhalb ConVars blockiert, Kommentare erhalten', () => {
  const gi = fx('gameinfo.gi');
  const draft = applyToText('gameinfo.gi', gi, [{ settingId: 'gi.citadel_camera_hero_fov', value: '100' }]);
  assert.ok(draft.includes('// Kommentar im ConVars-Block'));
  assert.ok(/citadel_camera_hero_fov "100"/.test(draft) || /citadel_camera_hero_fov\s+"100"/.test(draft));
  const cs = buildChangeSet([loaded('gameinfo.gi', gi)], { 'gameinfo.gi': draft });
  assert.equal(cs.files[0].items[0].blocked?.reason, 'draft-only');
  const struct = gi.replace('Game                core', 'Game                citadel/addons');
  const cs2 = buildChangeSet([loaded('gameinfo.gi', gi)], { 'gameinfo.gi': struct });
  assert.ok(cs2.files[0].items.some((i) => i.blocked?.reason === 'structure-outside-convars'));
});

test('gameinfo.gi-Import übernimmt nie die Datei und erkennt Mod-Abhängigkeiten', () => {
  const rep = importInto('gameinfo.gi', fx('gameinfo.gi'), fx('gameinfo.foreign.gi'), { groups: ['grafik', 'anzeige', 'crosshair', 'eingabe'] });
  assert.equal(rep.draftText, fx('gameinfo.gi'));
  assert.ok(rep.skippedDraftOnly.some((s) => s.startsWith('citadel_camera_hero_fov')));
  assert.ok(rep.modHints.some((h) => /addons/.test(h)));
  assert.ok(rep.notAdopted.some((n) => n.key === 'sc_disable_baked_lighting'));
});

test('cfg: Duplikate – wirksam ist der letzte Eintrag, Änderung trifft genau diesen', () => {
  const t = fx('autoexec.cfg');
  const doc = parseCfg(t);
  assert.equal(effectiveConvars(doc).get('sensitivity')?.args[0], '1.6');
  const out = setConvars(doc, [{ name: 'sensitivity', value: '2' }]);
  assert.ok(out.includes('sensitivity "1.4" // alt'));
  assert.ok(out.includes('sensitivity 2\n'));
  assert.ok(out.includes('bind "MOUSE4" "+in_ability_ping"'));
});

test('Crosshair-Import verändert nur Crosshair-Werte', () => {
  const local = fx('autoexec.cfg');
  const rep = importInto('autoexec.cfg', local, fx('autoexec.foreign.cfg'), { groups: ['crosshair'] });
  const after = readValues('autoexec.cfg', rep.draftText);
  assert.equal(after.get('sensitivity')?.value, '1.6');
  assert.equal(after.get('citadel_crosshair_color_g')?.value, '255');
  assert.equal(after.get('citadel_crosshair_pip_gap')?.value, '2');
  assert.equal(after.has('sv_cheats'), false);
  assert.ok(rep.notAdopted.some((n) => n.key === 'sv_cheats' && /nie/.test(n.why)));
  assert.ok(rep.notAdopted.some((n) => n.key === 'exec'));
  assert.ok(rep.notAdopted.some((n) => n.key === 'alias'));
  // nur Crosshair-Zeilen neu/geändert
  const diffLines = rep.draftText.split('\n').filter((l) => !local.includes(l));
  assert.ok(diffLines.every((l) => l.includes('citadel_crosshair') || l.startsWith('// ') || l === ''), diffLines.join('|'));
});

test('Encoding: BOM bleibt erhalten, ungültiges UTF-8 wird nicht bearbeitet', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a "1"\n')]);
  const d = decodeBytes(bytes);
  assert.equal(d.bom, true);
  assert.deepEqual([...encodeText(d)], [...bytes]);
  assert.throws(() => decodeBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), UnsupportedEncodingError);
  assert.throws(() => decodeBytes(new Uint8Array([0x41, 0xc3, 0x28])), UnsupportedEncodingError);
});

test('Duplikate in KV werden erkannt', () => {
  const d = duplicates(parseKv('"v" { "a" "1" "b" "2" "a" "3" }').nodes[0].children!);
  assert.deepEqual(d, [{ key: 'a', lines: [1, 1], values: ['1', '3'] }]);
});

test('Config-Erklärung und Typ-Erkennung', () => {
  const ex = explainConfig('video.txt', fx('video.foreign.txt'), fx('video.local.txt'));
  assert.ok(ex.device.some((d) => d.startsWith('VendorID')));
  assert.ok(ex.unknown.some((u) => u.key === 'setting.some_unknown_thing'));
  assert.equal(detectKind('x.txt', fx('video.foreign.txt')), 'video.txt');
  assert.equal(detectKind('gameinfo.gi', ''), 'gameinfo.gi');
});

test('Crosshair: Presets gültig, ≥30 eigene, Share-Code round-trip, manipulierte Codes abgelehnt', () => {
  assert.ok(OWN_PRESETS.length >= 30);
  assert.equal(new Set(OWN_PRESETS.map((p) => p.id)).size, OWN_PRESETS.length);
  for (const p of OWN_PRESETS) assert.deepEqual(validateCrosshair(p.params), [], p.id);
  const p = OWN_PRESETS[5].params;
  const code = encodeShareCode(p, 'Test');
  const back = decodeShareCode(code);
  assert.deepEqual(back.params, p);
  assert.equal(back.name, 'Test');
  const broken = code.slice(0, -2) + (code.endsWith('aa') ? 'bb' : 'aa');
  assert.throws(() => decodeShareCode(broken));
  assert.throws(() => decodeShareCode('bind x quit'));
  assert.match(consoleCommand(p), /citadel_crosshair_color_r \d+; /);
  assert.ok(renderSvg(p, { size: 64 }).startsWith('<svg'));
});

test('Crosshair aus Freitext, fehlende Werte werden gemeldet', () => {
  const m = parseCrosshairCommands('My settings: citadel_crosshair_pip_gap "3"; citadel_crosshair_color_r 10 and more');
  const r = fromConvars(m);
  assert.equal(r.params.pipGap, 3);
  assert.equal(r.params.color[0], 10);
  assert.ok(r.missing.includes('citadel_crosshair_dot_size'));
  assert.equal(Object.keys(toSettingValues(CROSSHAIR_DEFAULTS)).length, 21);
});

test('Benchmark: echte CSV-Auswertung, 1%-Low-Definition, uneindeutige Unterschiede', () => {
  const rows = ['Application,ProcessID,MsBetweenPresents,MsGPUBusy'];
  for (let i = 0; i < 1000; i++) rows.push(`deadlock.exe,1,${i % 50 === 0 ? 20 : 10},9`);
  rows.push('other.exe,2,1,1');
  const s = parseFrameCsv(rows.join('\n'), 't.csv', { processName: 'deadlock.exe' });
  assert.equal(s.frametimesMs.length, 1000);
  const st = computeStats(s.frametimesMs);
  assert.ok(Math.abs(st.avgFps - 1000 / 10.2) < 0.01);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(st.low1PercentileFps, 50);
  assert.throws(() => parseFrameCsv('a,b\n1,2', 'x'));
  const mk = (fps: number) => ({ ...st, avgFps: fps });
  assert.equal(compareRuns([mk(100), mk(104)], [mk(102), mk(105)], 'avgFps').verdict, 'uneindeutig');
  assert.equal(compareRuns([mk(100), mk(101)], [mk(120), mk(121)], 'avgFps').verdict, 'besser');
  assert.equal(compareRuns([mk(100)], [mk(120)], 'avgFps').verdict, 'zu-wenig-daten');
});

test('Profil-Mixer: Konflikte werden gemeldet, Grafik-only lässt Crosshair/Eingabe unberührt', () => {
  const a = createProfile('A', { 'video.mat_vsync': '0', 'cfg.sensitivity': '1.5', 'cfg.citadel_crosshair_pip_gap': '3' }, { type: 'custom', label: '' });
  const b = createProfile('B', { 'video.mat_vsync': '1', 'cfg.sensitivity': '2' }, { type: 'custom', label: '' });
  const g = mixProfiles([{ profile: b, groups: ['grafik', 'anzeige'] }]);
  assert.deepEqual(Object.keys(g.values), ['video.mat_vsync']);
  const m = mixProfiles([{ profile: a, groups: ['crosshair', 'anzeige'] }, { profile: b, groups: ['anzeige', 'eingabe'] }]);
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.values['cfg.sensitivity'], '2');
  const r = mixProfiles([{ profile: a, groups: ['anzeige'] }, { profile: b, groups: ['anzeige'] }], { 'video.mat_vsync': a.id });
  assert.equal(r.values['video.mat_vsync'], '0');
});

test('Portabler Export entfernt Gerätewerte; zusammengesetztes Profil heißt nie Original', () => {
  const p = createProfile('X', { 'video.defaultres': '2560', 'video.mat_vsync': '0' }, { type: 'player-compiled', label: 'Spieler Y', playerId: 'pl_1' });
  const e = portableExport(p) as { values: Record<string, string>; originLabel: string };
  assert.deepEqual(e.values, { 'video.mat_vsync': '0' });
  assert.equal(e.originLabel, 'Aus veröffentlichten Einstellungen zusammengestellt');
  assert.equal(JSON.stringify(e).includes('pl_1'), false);
  const back = importPortable(JSON.parse(JSON.stringify(e)));
  assert.equal(back.values['video.mat_vsync'], '0');
});

test('Sensitivität: eDPI ja, cm/360 ohne verifizierte Formel nein', () => {
  assert.equal(eDpi(1.5, 800), 1200);
  assert.equal(eDpi(null, 800), null);
  assert.equal(cm360(1.5, 800).value, null);
});

test('Patch-Check und gameinfo-Wiederherstellung über Buildgrenzen', () => {
  const v = fx('video.local.txt');
  const prev = snapshotState('100', [{ kind: 'video.txt', sha256: 'a', text: v }]);
  const next = snapshotState('101', [{ kind: 'video.txt', sha256: 'b', text: v.replace('\t"setting.mystery_future_key"\t\t"7"\r\n', '\t"setting.brand_new"\t\t"1"\r\n') }]);
  const r = comparePatch(prev, next);
  assert.equal(r.buildChanged, true);
  assert.ok(r.removedKeys.some((k) => k.includes('mystery_future_key')));
  assert.ok(r.newUnknownKeys.some((k) => k.includes('brand_new')));
  assert.equal(canRestoreWholeFile('gameinfo.gi', '100', '101').ok, false);
  assert.equal(canRestoreWholeFile('video.txt', '100', '101').ok, true);
});

test('Empfehlungen sind deterministisch, begründet und respektieren fehlende Daten', () => {
  const video = new Map(Object.entries({ 'video.mat_vsync': '1', 'video.r_low_latency': '0', 'video.r_citadel_motion_blur': '1', 'video.fps_max': '0', 'video.mat_viewportscale': '1.000000' }));
  const hw: HardwareSnapshot = {
    schema: 1,
    capturedAt: '',
    method: 'manual',
    cpu: { value: null, source: 'manual' },
    gpus: { value: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', vramMb: 12288, driverVersion: '1', driverDate: null }], source: 'manual' },
    activeGpuIndex: 0,
    ramTotalMb: { value: null, source: 'x' },
    ramUsedMb: { value: null, source: 'x' },
    os: { value: null, source: 'x' },
    displays: { value: [{ name: 'D', primary: true, currentWidth: 2560, currentHeight: 1440, currentHz: 60, maxHzAtCurrentRes: 165, modes: [] }], source: 'x' },
    laptop: { value: false, source: 'x' },
    powerPlan: { value: null, source: 'x' },
  };
  const recs = recommend({ hw, video, goals: { targetFps: 144, quality: 'leistung', problem: 'wenig-fps' } });
  const ids = recs.map((r) => r.ruleId);
  assert.equal(ids[0], 'display-refresh');
  assert.ok(ids.includes('reflex-on') && ids.includes('vsync-off-competitive') && ids.includes('render-scale'));
  assert.ok(recs.every((r) => r.basis === 'begruendet'));
  const none = recommend({ hw: null, video: new Map(), goals: { targetFps: null, quality: 'ausgewogen', problem: 'keins' } });
  assert.deepEqual(none, []);
  assert.equal(bottleneckHint(null).label, 'Keine Aussage');
});
