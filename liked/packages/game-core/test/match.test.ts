import { describe, expect, it } from 'vitest';
import type { ClipRef } from '@liked/protocol';
import { canTransition, createRng, MatchEngine, standings, awardTitles, emptyStats } from '../src/index.js';

const players = ['A', 'B', 'C', 'D'];
const queues = (per: number) =>
  new Map(
    players.map((p, i) => [
      p,
      Array.from({ length: per }, (_, k) => ({ source: 'demo', videoId: `demo-${p.toLowerCase()}${i}x${k}aa` }) as ClipRef)
    ])
  );

function engine(clipsPerPerson = 5, per = 8, seed = 42) {
  return new MatchEngine({ players, clipsPerPerson, queues: queues(per), rng: createRng(seed), maxReplacements: 12 });
}

/** Spielt eine Runde: alle Abstimmungsberechtigten wählen `choose(voter, owner)`. */
function playRound(e: MatchEngine, id: string, choose: (voter: string, owner: string) => string) {
  const next = e.nextClip();
  if (next.kind !== 'clip') throw new Error(next.kind);
  const r = e.beginRound({ roundId: id, ownerId: next.ownerId, clip: next.clip, startAt: 1000, deadline: 21000 });
  r.eligible.forEach((v, i) => e.recordVote(v, id, choose(v, next.ownerId), `vote${id}${v}xx`, 1500 + i * 500));
  return { owner: next.ownerId, outcomes: e.finishRound() };
}

describe('Blockplanung (Abnahme 4)', () => {
  it('jeder rät in einem Block genau dreimal und setzt genau einmal aus', () => {
    const e = engine(5);
    const owners: string[] = [];
    const voted = new Map(players.map((p) => [p, 0]));
    for (let i = 0; i < 4; i++) {
      const { owner, outcomes } = playRound(e, `r${i}`, (_v, o) => o);
      owners.push(owner);
      outcomes.forEach((o) => voted.set(o.voterId, voted.get(o.voterId)! + 1));
      expect(outcomes.map((o) => o.voterId)).not.toContain(owner);
    }
    expect(new Set(owners).size).toBe(4);
    expect([...voted.values()]).toEqual([3, 3, 3, 3]);
    expect(e.completedBlocks).toBe(1);
  });

  it('vier Spieler × fünf Clips = 20 Runden ohne Wiederholung und ohne gleichen Besitzer direkt hintereinander', () => {
    for (let seed = 1; seed < 40; seed++) {
      const e = engine(5, 5, seed);
      expect(e.totalRounds).toBe(20);
      const owners: string[] = [];
      const clips = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const n = e.nextClip();
        if (n.kind !== 'clip') throw new Error(n.kind);
        clips.add(n.clip.videoId);
        e.beginRound({ roundId: `r${i}`, ownerId: n.ownerId, clip: n.clip, startAt: 0, deadline: 1 });
        e.finishRound();
        owners.push(n.ownerId);
      }
      expect(e.nextClip().kind).toBe('done');
      expect(clips.size).toBe(20);
      for (let i = 1; i < owners.length; i++) expect(owners[i]).not.toBe(owners[i - 1]);
      expect(e.isComplete).toBe(true);
    }
  });
});

describe('Stimmen (Abnahme 9)', () => {
  it('doppelte Stimme und Retry ändern nichts, verspätete Stimmen werden verworfen', () => {
    const e = engine();
    const n = e.nextClip();
    if (n.kind !== 'clip') throw new Error();
    const r = e.beginRound({ roundId: 'r1', ownerId: n.ownerId, clip: n.clip, startAt: 1000, deadline: 5000 });
    const [v1, v2] = r.eligible as [string, string];
    const wrong = players.find((p) => p !== v1 && p !== n.ownerId)!;
    expect(e.recordVote(v1, 'r1', n.ownerId, 'voteid001', 2000)).toMatchObject({ ok: true, duplicate: false });
    expect(e.recordVote(v1, 'r1', wrong, 'voteid002', 2100)).toMatchObject({ ok: true, duplicate: true, targetId: n.ownerId });
    expect(e.recordVote(v1, 'r1', n.ownerId, 'voteid001', 2200)).toMatchObject({ ok: true, duplicate: true });
    expect(e.recordVote(v2, 'r1', n.ownerId, 'voteid003', 6000)).toEqual({ ok: false, error: 'too_late' });
    expect(e.recordVote(v2, 'r0', n.ownerId, 'voteid004', 2000)).toEqual({ ok: false, error: 'round_mismatch' });
    expect(e.recordVote(n.ownerId, 'r1', v1, 'voteid005', 2000)).toEqual({ ok: false, error: 'not_eligible' });
    expect(e.recordVote(v2, 'r1', v2, 'voteid006', 2000)).toEqual({ ok: false, error: 'invalid_target' });
    expect(e.recordVote(v2, 'r1', n.ownerId, 'voteid007', 900)).toEqual({ ok: false, error: 'wrong_phase' });
    const first = e.finishRound();
    const again = e.finishRound();
    expect(again).toBe(first);
    expect(e.stats.get(v1)!.score).toBe(1000);
    expect(e.recordVote(v2, 'r1', n.ownerId, 'voteid008', 3000)).toEqual({ ok: false, error: 'too_late' });
  });
});

describe('Streaks, Annullierung und Rollback (Abnahme 7)', () => {
  it('eigener Clip lässt die Streak unverändert', () => {
    const e = engine();
    const streakBefore = new Map<string, number>();
    for (let i = 0; i < 4; i++) {
      players.forEach((p) => streakBefore.set(p, e.stats.get(p)!.streak));
      const { owner } = playRound(e, `r${i}`, (_v, o) => o);
      expect(e.stats.get(owner)!.streak).toBe(streakBefore.get(owner));
    }
    // Jeder war 3x richtig → Streak 3
    players.forEach((p) => expect(e.stats.get(p)!.streak).toBe(3));
  });

  it('annullierte Runde ändert weder Punkte noch Streak und der Ersatz kommt vom selben Besitzer', () => {
    const e = engine();
    playRound(e, 'r0', (_v, o) => o);
    const before = JSON.stringify([...e.stats]);
    const n = e.nextClip();
    if (n.kind !== 'clip') throw new Error();
    e.beginRound({ roundId: 'r1', ownerId: n.ownerId, clip: n.clip, startAt: 0, deadline: 10000 });
    const voter = players.find((p) => p !== n.ownerId)!;
    e.recordVote(voter, 'r1', n.ownerId, 'voteabc123', 100);
    e.voidRound();
    expect(JSON.stringify([...e.stats])).toBe(before);
    expect(() => e.finishRound()).toThrow();
    const replacement = e.nextClip();
    expect(replacement).toMatchObject({ kind: 'clip', ownerId: n.ownerId });
    if (replacement.kind === 'clip') expect(replacement.clip.videoId).not.toBe(n.clip.videoId);
  });

  it('falsche Antwort setzt die Streak auf null', () => {
    const e = engine();
    playRound(e, 'r0', (_v, o) => o);
    const { outcomes } = playRound(e, 'r1', (v, o) => players.find((p) => p !== v && p !== o)!);
    outcomes.forEach((o) => expect(o.streak).toBe(0));
  });

  it('unvollständiger Block wird vollständig zurückgerollt', () => {
    const e = engine();
    for (let i = 0; i < 4; i++) playRound(e, `a${i}`, (_v, o) => o);
    const afterBlock1 = JSON.stringify([...e.stats]);
    playRound(e, 'b0', (_v, o) => o);
    playRound(e, 'b1', (_v, o) => o);
    expect(JSON.stringify([...e.stats])).not.toBe(afterBlock1);
    expect(e.rollbackIncompleteBlock()).toEqual({ rolledBack: true });
    expect(JSON.stringify([...e.stats])).toBe(afterBlock1);
    expect(e.completedBlocks).toBe(1);
  });

  it('Rollback ohne abgeschlossenen Block setzt alles auf null', () => {
    const e = engine();
    playRound(e, 'r0', (_v, o) => o);
    e.rollbackIncompleteBlock();
    expect(e.completedBlocks).toBe(0);
    players.forEach((p) => expect(e.stats.get(p)).toEqual(emptyStats()));
  });

  it('erschöpfter Ersatzpool wird gemeldet', () => {
    const e = new MatchEngine({ players, clipsPerPerson: 1, queues: queues(1), rng: createRng(3), maxReplacements: 10 });
    const n = e.nextClip();
    if (n.kind !== 'clip') throw new Error();
    e.beginRound({ roundId: 'x', ownerId: n.ownerId, clip: n.clip, startAt: 0, deadline: 1 });
    e.voidRound();
    expect(e.nextClip()).toEqual({ kind: 'exhausted', ownerId: n.ownerId });
  });

  it('begrenzt wiederholte Ersatzversuche', () => {
    const e = new MatchEngine({ players, clipsPerPerson: 1, queues: queues(9), rng: createRng(3), maxReplacements: 2 });
    for (let i = 0; i < 3; i++) {
      const n = e.nextClip();
      if (n.kind !== 'clip') throw new Error(n.kind);
      e.beginRound({ roundId: `x${i}`, ownerId: n.ownerId, clip: n.clip, startAt: 0, deadline: 1 });
      e.voidRound();
    }
    expect(e.nextClip()).toEqual({ kind: 'too_many_replacements' });
  });
});

describe('Endwertung', () => {
  it('teilt Plätze bei gleichen Punkten und gleicher Trefferzahl, sonst entscheidet die Trefferzahl', () => {
    const s = new Map([
      ['a', { ...emptyStats(), score: 2000, correct: 2 }],
      ['b', { ...emptyStats(), score: 2000, correct: 2 }],
      ['c', { ...emptyStats(), score: 2000, correct: 3 }],
      ['d', { ...emptyStats(), score: 100, correct: 1 }]
    ]);
    const st = standings(s, ['a', 'b', 'c', 'd']);
    expect(st.map((e) => [e.playerId, e.place])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
      ['d', 4]
    ]);
  });
  it('vergibt Titel nur eindeutig', () => {
    const s = new Map([
      ['a', { ...emptyStats(), correct: 4, firstCorrect: 2, longestStreak: 3 }],
      ['b', { ...emptyStats(), correct: 4, firstCorrect: 1, longestStreak: 2 }]
    ]);
    expect(awardTitles(s)).toEqual([
      { id: 'blitzrater', playerId: 'a' },
      { id: 'serientaeter', playerId: 'a' }
    ]);
  });
});

describe('Zustandsmaschine', () => {
  it('erlaubt nur definierte Übergänge', () => {
    expect(canTransition('LOBBY', 'PREPARING')).toBe(true);
    expect(canTransition('LOBBY', 'REVEAL')).toBe(false);
    expect(canTransition('SCOREBOARD', 'RESULTS')).toBe(true);
    expect(canTransition('REVEAL', 'PREPARING')).toBe(false);
    expect(canTransition('PLAYING_AND_VOTING', 'PREPARING')).toBe(true);
    expect(canTransition('RESULTS', 'PREPARING')).toBe(false);
  });
});
