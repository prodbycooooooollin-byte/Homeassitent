import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@liked/protocol';
import { SoloDemo, SOLO_BOTS, SOLO_ME_ID } from '../src/lib/solo-demo';
import { estimateMinutes, roundsInfo } from '../src/lib/game-info';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(botAccuracy = 0.5) {
  let view: RoomView | null = null;
  const views: RoomView[] = [];
  const demo = new SoloDemo({
    me: { name: 'Test', avatar: 'fox', seed: 'seed-123' },
    onView: (v) => {
      view = v;
      views.push(v);
    },
    random: () => 0.42,
    botAccuracy
  });
  demo.start();
  return { demo, views, get view() { return view!; } };
}

/** Spielt automatisch: lädt Clips, tippt als Mensch immer auf die erste Karte. */
async function playToEnd(s: ReturnType<typeof setup>, maxSteps = 5000) {
  const handled = new Set<string>();
  for (let i = 0; i < maxSteps && s.view.phase !== 'RESULTS'; i++) {
    const v = s.view;
    const r = v.round;
    if (v.phase === 'PREPARING' && r && !handled.has(`load:${r.roundId}:${r.loadAttempt}`)) {
      handled.add(`load:${r.roundId}:${r.loadAttempt}`);
      s.demo.handle('playerStatus', { roundId: r.roundId, status: 'ready' });
    }
    if (v.phase === 'PLAYING_AND_VOTING' && r?.you.role === 'voter' && !handled.has(`vote:${r.roundId}`)) {
      handled.add(`vote:${r.roundId}`);
      s.demo.handle('vote', { roundId: r.roundId, targetId: r.answerOptions[0], voteId: `v_${r.roundId}` });
    }
    await vi.advanceTimersByTimeAsync(250);
  }
}

describe('Solo-Demo', () => {
  it('startet mit genau drei Teilnehmern, zwei davon klar als simuliert gekennzeichnet', () => {
    const s = setup();
    expect(s.view.players).toHaveLength(3);
    expect(s.view.players.filter((p) => p.simulated).map((p) => p.id)).toEqual(SOLO_BOTS.map((b) => b.id));
    expect(s.view.players.find((p) => p.id === SOLO_ME_ID)!.simulated).toBeUndefined();
    expect(s.view.solo).toBe(true);
    expect(s.view.mode).toBe('demo');
  });

  it('verlangt Medientest und Bereitschaft vor dem Start', () => {
    const s = setup();
    expect(s.demo.handle('start')).toEqual({ ok: false, error: 'cannot_start' });
    expect(s.demo.handle('setReady', { ready: true })).toEqual({ ok: false, error: 'cannot_start' });
    s.demo.handle('mediaCheck', { ok: true });
    expect(s.view.startBlockers.map((b) => b.kind)).toEqual(['not_ready']);
    s.demo.handle('setReady', { ready: true });
    expect(s.view.startBlockers).toEqual([]);
    // Fehlgeschlagener Medientest nimmt die Bereitschaft zurück
    s.demo.handle('mediaCheck', { ok: false });
    expect(s.view.players[0]!.ready).toBe(false);
    expect(s.view.startBlockers.map((b) => b.kind)).toContain('media_unchecked');
  });

  it('spielt den vollständigen Ablauf bis zum Endergebnis und lässt sich neu starten', async () => {
    const s = setup();
    s.demo.handle('mediaCheck', { ok: true });
    s.demo.handle('setReady', { ready: true });
    expect(s.demo.handle('start')).toEqual({ ok: true });
    await playToEnd(s);
    expect(s.view.phase).toBe('RESULTS');
    const phases = new Set(s.views.map((v) => v.phase));
    for (const p of ['PREPARING', 'COUNTDOWN', 'PLAYING_AND_VOTING', 'REVEAL', 'SCOREBOARD', 'RESULTS']) expect(phases.has(p as never)).toBe(true);
    const res = s.view.results!;
    expect(res.completedBlocks).toBe(5);
    // 3 Spieler × 5 Clips = 15 Runden; jeder rät 10-mal (eigene 5 Clips ausgenommen)
    expect(s.views.filter((v) => v.reveal).map((v) => v.reveal!.roundId).filter((x, i, a) => a.indexOf(x) === i)).toHaveLength(15);
    for (const st of res.standings) expect(st.opportunities).toBe(10);
    expect(s.demo.timerCount).toBe(0);

    // Neustart
    expect(s.demo.handle('rematch')).toEqual({ ok: true });
    expect(s.view.phase).toBe('LOBBY');
    expect(s.view.players[0]!.ready).toBe(false);
  }, 30_000);

  it('Einstellungsänderung setzt die Bereitschaft zurück', () => {
    const s = setup();
    s.demo.handle('mediaCheck', { ok: true });
    s.demo.handle('setReady', { ready: true });
    s.demo.handle('updateSettings', { clipsPerPerson: 8 });
    expect(s.view.players[0]!.ready).toBe(false);
    expect(s.view.settings.clipsPerPerson).toBe(8);
  });

  it('lässt sich jederzeit verlassen und räumt alle Timer auf', async () => {
    const s = setup();
    s.demo.handle('mediaCheck', { ok: true });
    s.demo.handle('setReady', { ready: true });
    s.demo.handle('start');
    await vi.advanceTimersByTimeAsync(500);
    expect(s.demo.handle('leaveRoom')).toEqual({ ok: true });
    expect(s.demo.isClosed).toBe(true);
    expect(s.demo.timerCount).toBe(0);
    expect(s.demo.handle('start')).toEqual({ ok: false, error: 'not_in_room' });
  });

  it('gibt die Lösung vor der Auflösung nicht preis', async () => {
    const s = setup();
    s.demo.handle('mediaCheck', { ok: true });
    s.demo.handle('setReady', { ready: true });
    s.demo.handle('start');
    await vi.advanceTimersByTimeAsync(100);
    for (const v of s.views.filter((x) => x.round)) {
      expect(v.reveal).toBeNull();
      expect(JSON.stringify(v.round)).not.toMatch(/ownerId/);
    }
  });
});

describe('Rundenzahl und Spieldauer', () => {
  it('rechnet unter drei Spielern ausdrücklich mit der Mindestzahl', () => {
    expect(roundsInfo(1, 5)).toEqual({ players: 3, rounds: 15, basedOnMinimum: true });
    expect(roundsInfo(4, 10)).toEqual({ players: 4, rounds: 40, basedOnMinimum: false });
  });
  it('liefert eine plausible Spanne', () => {
    const e = estimateMinutes(15, 20);
    expect(e.min).toBeLessThan(e.max);
    // 15 Runden × (4 + 3 + 20 + 7 + 5) s ≈ 9,75 min
    expect(e.max).toBe(10);
    expect(e.min).toBeGreaterThanOrEqual(5);
  });
});
