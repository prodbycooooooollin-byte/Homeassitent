// Gemeinsame Helfer für die Browser-/Desktop-Prüfungen.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import WebSocket from 'ws';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer(port) {
  const server = spawn('node', ['dist/server/server.mjs'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  process.on('exit', () => server.kill('SIGTERM'));
  await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('läuft') && res()));
  return server;
}

export async function launchBrowser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
}

export function checker() {
  const failures = [];
  const check = (cond, msg) => {
    if (!cond) {
      failures.push(msg);
      console.error('✗', msg);
    } else console.log('✓', msg);
    return cond;
  };
  return { failures, check };
}

/** Unabhängiger Browser-Spieler (eigener Kontext = eigene Sitzung). */
export async function browserPlayer(browser, base, name, avatar, { fresh = false, viewport = { width: 1366, height: 768 }, reduced = false, path = '/' } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (!fresh) {
    await ctx.addInitScript(
      ([n, a]) => {
        if (!localStorage.getItem('impostor.profile')) {
          localStorage.setItem('impostor.profile', JSON.stringify({ name: n, avatar: a, set: true }));
          localStorage.setItem('impostor.settings', JSON.stringify({ version: 2, onboardingDone: true, muted: true }));
        }
      },
      [name, avatar],
    );
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path);
  return { name, ctx, page, errors };
}

/** Minimaler Protokoll-Bot: tritt bei, ist bereit, bestätigt Rolle, gibt Hinweise. */
export async function bot(port, name, avatar, lobbyCode, { autoClue = true } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let seq = 0;
  let me = null;
  const state = { view: null };
  const send = (cmd) => ws.send(JSON.stringify({ type: 'cmd', actionId: `${name}-${++seq}`, cmd }));
  ws.on('message', (d) => {
    const msg = JSON.parse(String(d));
    if (msg.type === 'welcome') {
      me = msg.playerId;
      send({ t: 'joinLobby', code: lobbyCode });
    }
    if (msg.type !== 'state' || !msg.view) return;
    const v = msg.view;
    state.view = v;
    const self = v.lobby.players.find((p) => p.id === me);
    if (v.lobby.phase === 'lobby' && self && !self.ready) send({ t: 'setReady', ready: true });
    if (v.match?.phase === 'roleReveal' && !v.match.acknowledged.includes(me)) send({ t: 'ackRole' });
    if (autoClue && v.match?.phase === 'clues' && v.match.activePlayerId === me) {
      setTimeout(() => send({ t: 'submitClue', text: `${name} · ${v.match.clues.length + 1}` }), 30);
    }
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'hello', token: null, profile: { name, avatar }, protocol: 1 }));
  return { ws, send, state, get id() { return me; } };
}

export function shooter(dir) {
  mkdirSync(dir, { recursive: true });
  return (page, file) => page.screenshot({ path: `${dir}/${file}.jpg`, type: 'jpeg', quality: 78 });
}
