import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateDuration } from '../shared/duration.ts';
import { DEFAULT_SETTINGS } from '../shared/protocol.ts';
import { PRODUCTION_SERVER, inviteLink, parseServerAddress, resolveServer } from '../shared/server.ts';
import { nameProblem, sanitizeHostPrefs, sanitizeProfile, sanitizeSettings } from '../client/src/state/sanitize.ts';
import { codeProblem, extractLobbyCode } from '../client/src/screens/invite.ts';

const PROD_WS = 'wss://imposter-hx0a.onrender.com/ws';

describe('Serveradresse', () => {
  it('normalisiert Eingaben ohne doppelte Pfade', () => {
    for (const input of [
      'imposter-hx0a.onrender.com',
      'https://imposter-hx0a.onrender.com',
      'https://imposter-hx0a.onrender.com/',
      'wss://imposter-hx0a.onrender.com/ws',
      'wss://imposter-hx0a.onrender.com/ws/',
      'https://imposter-hx0a.onrender.com/ws/ws',
      '  https://imposter-hx0a.onrender.com//  ',
    ]) {
      const e = parseServerAddress(input);
      assert.equal(e?.wsUrl, PROD_WS, input);
      assert.equal(e?.httpBase, PRODUCTION_SERVER, input);
    }
  });

  it('lokale Adressen ohne Schema nutzen ws/http, fremde Protokolle werden abgelehnt', () => {
    assert.equal(parseServerAddress('localhost:8787')?.wsUrl, 'ws://localhost:8787/ws');
    assert.equal(parseServerAddress('192.168.0.10:8787/')?.httpBase, 'http://192.168.0.10:8787');
    for (const bad of ['', '   ', 'file:///C:/app/index.html', 'javascript:alert(1)', 'ftp://x', null, 42]) {
      assert.equal(parseServerAddress(bad), null, String(bad));
    }
  });

  it('Desktop-App ohne Konfiguration verwendet den Produktionsserver – nie localhost', () => {
    const r = resolveServer({ isDesktop: true, desktopDefault: '', buildDefault: '', pageOrigin: 'null', pageProtocol: 'file:' });
    assert.equal(r.endpoint.wsUrl, PROD_WS);
    assert.equal(r.source, 'production');
  });

  it('ungültige gespeicherte Werte blockieren den Standard nicht', () => {
    const r = resolveServer({ isDesktop: true, override: 'file:///kaputt', desktopDefault: '   ', buildDefault: 'nonsense://' });
    assert.equal(r.endpoint.wsUrl, PROD_WS);
  });

  it('Browser nutzt den Server, der die Seite ausgeliefert hat', () => {
    const r = resolveServer({ isDesktop: false, pageOrigin: 'https://imposter-hx0a.onrender.com', pageProtocol: 'https:' });
    assert.equal(r.endpoint.wsUrl, PROD_WS);
    assert.equal(r.source, 'origin');
  });

  it('Entwickler-Override hat Vorrang und ist als solcher erkennbar', () => {
    const r = resolveServer({ isDesktop: true, override: 'ws://localhost:8787' });
    assert.equal(r.source, 'override');
    assert.equal(r.endpoint.wsUrl, 'ws://localhost:8787/ws');
  });

  it('Einladungslink zeigt auf die öffentliche Web-Version', () => {
    assert.equal(inviteLink(parseServerAddress(PROD_WS)!, 'K7QXM'), 'https://imposter-hx0a.onrender.com/?lobby=K7QXM');
  });
});

describe('Gespeicherte Einstellungen', () => {
  it('Migration verwirft alte Serveradressen (Version 1)', () => {
    const s = sanitizeSettings({ serverUrl: 'ws://localhost:8787/ws', sfxVolume: 0.3, onboardingDone: true });
    assert.equal(s.serverOverride, '');
    assert.equal((s as unknown as Record<string, unknown>).serverUrl, undefined);
    assert.equal(s.sfxVolume, 0.3);
    assert.equal(s.onboardingDone, true);
  });

  it('bewusster Override (Version 2) bleibt erhalten, ungültiger nicht', () => {
    assert.equal(sanitizeSettings({ version: 2, serverOverride: 'ws://localhost:8787' }).serverOverride, 'ws://localhost:8787');
    assert.equal(sanitizeSettings({ version: 2, serverOverride: 'file:///x' }).serverOverride, '');
  });

  it('kaputte Werte fallen auf Standards zurück', () => {
    const s = sanitizeSettings({ sfxVolume: 'laut', musicVolume: 7, reducedMotion: 'vielleicht' });
    assert.equal(s.sfxVolume, 0.7);
    assert.equal(s.musicVolume, 1);
    assert.equal(s.reducedMotion, 'system');
    assert.deepEqual(sanitizeSettings(null).serverOverride, '');
  });

  it('Profil: Name wird bereinigt, ungültige Avatare ersetzt', () => {
    const p = sanitizeProfile({ name: '  Jürgen   Groß  ', avatar: 99, set: true }, 3);
    assert.equal(p.name, 'Jürgen Groß');
    assert.equal(p.avatar, 3);
    assert.equal(sanitizeProfile({ name: '   ', set: true }, 1).set, false);
    assert.equal(nameProblem('   '), 'Bitte gib einen Namen ein.');
    assert.match(nameProblem('x'.repeat(17)) ?? '', /Höchstens 16/);
    assert.equal(nameProblem('Ömer Ünal'), null);
  });

  it('Host-Präferenzen nur mit gültigen Werten', () => {
    assert.deepEqual(sanitizeHostPrefs({ maxRounds: 7, turnSeconds: 45, categories: ['tiere', 'x'] }), { turnSeconds: 45, categories: ['tiere'] });
    assert.equal(sanitizeHostPrefs({}), null);
  });
});

describe('Lobby-Code-Eingabe', () => {
  it('akzeptiert eingefügte Links und Kleinschreibung', () => {
    assert.equal(extractLobbyCode('https://imposter-hx0a.onrender.com/?lobby=k7qxm'), 'K7QXM');
    assert.equal(extractLobbyCode(' k7q-xm '), 'K7QXM');
    assert.match(codeProblem('K7Q') ?? '', /5 Zeichen/);
    assert.match(codeProblem('K7Q0M') ?? '', /„0"/);
    assert.equal(codeProblem('K7QXM'), null);
  });
});

describe('Dauerschätzung', () => {
  it('liefert eine Spanne und keine scheinbar genaue Dauer ohne Zugtimer', () => {
    const e = estimateDuration(5, DEFAULT_SETTINGS.maxRounds, 30);
    assert.ok(e.minMinutes! < e.maxMinutes!);
    assert.equal(estimateDuration(5, 5, 0).minMinutes, null);
    assert.match(estimateDuration(5, 5, 0).label, /offen/);
  });
});
