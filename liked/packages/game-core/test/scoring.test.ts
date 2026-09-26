import { describe, expect, it } from 'vitest';
import { basePoints, rankCorrectVotes, roundPoints, scoreRound, streakMultiplierPercent } from '../src/index.js';

describe('Basispunkte (Abnahme 6)', () => {
  it('ergibt 1000/850/700 bei drei Abstimmungsberechtigten', () => {
    expect([1, 2, 3].map((r) => basePoints(r, 3))).toEqual([1000, 850, 700]);
  });
  it('folgt der allgemeinen Formel mit Rundung', () => {
    // m = 7: 1000 - 300 * 1/6 = 950, r=3 → 900, r=7 → 700
    expect(basePoints(1, 7)).toBe(1000);
    expect(basePoints(2, 7)).toBe(950);
    expect(basePoints(7, 7)).toBe(700);
    // m = 4: 1000 - 100 = 900, 800, 700
    expect([1, 2, 3, 4].map((r) => basePoints(r, 4))).toEqual([1000, 900, 800, 700]);
    // m = 6: 1000 - 60*(r-1)
    expect(basePoints(4, 6)).toBe(820);
  });
  it('liefert 1000 bei m = 1', () => {
    expect(basePoints(1, 1)).toBe(1000);
  });
});

describe('Streak-Multiplikator', () => {
  it('deckelt bei ×1,15', () => {
    expect([1, 2, 3, 4, 5, 12].map(streakMultiplierPercent)).toEqual([100, 105, 110, 115, 115, 115]);
  });
  it('rundet wie im Beispiel der Spezifikation', () => {
    expect(roundPoints(1000, 3)).toBe(1100);
    expect(roundPoints(850, 2)).toBe(893);
    expect(roundPoints(700, 4)).toBe(805);
  });
});

describe('Rang nur unter richtigen Tipps (Abnahme 5)', () => {
  it('ein sehr schneller falscher Tipp nimmt niemandem Platz 1', () => {
    const ranks = rankCorrectVotes(
      [
        { voterId: 'a', targetId: 'x', elapsedMs: 10 },
        { voterId: 'b', targetId: 'owner', elapsedMs: 900 },
        { voterId: 'c', targetId: 'owner', elapsedMs: 2000 }
      ],
      'owner'
    );
    expect(ranks.get('a')).toBeUndefined();
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(2);
  });
  it('gleiche 80-ms-Gruppe teilt den Rang, danach wird weitergezählt', () => {
    const ranks = rankCorrectVotes(
      [
        { voterId: 'a', targetId: 'o', elapsedMs: 1601 },
        { voterId: 'b', targetId: 'o', elapsedMs: 1679 },
        { voterId: 'c', targetId: 'o', elapsedMs: 1680 }
      ],
      'o'
    );
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(3);
  });
});

describe('scoreRound', () => {
  it('wertet vier Spieler inklusive Streaks und fehlender Antwort', () => {
    const out = scoreRound({
      ownerId: 'd',
      eligible: ['a', 'b', 'c'],
      votes: [
        { voterId: 'a', targetId: 'd', elapsedMs: 3000 },
        { voterId: 'b', targetId: 'd', elapsedMs: 1000 },
        { voterId: 'd', targetId: 'a', elapsedMs: 10 } // Besitzer darf nicht mitwerten
      ],
      streaks: new Map([
        ['a', 1],
        ['b', 2],
        ['c', 5],
        ['d', 3]
      ])
    });
    const by = Object.fromEntries(out.map((o) => [o.voterId, o]));
    expect(by.b).toMatchObject({ correct: true, rank: 1, basePoints: 1000, streak: 3, points: 1100 });
    expect(by.a).toMatchObject({ correct: true, rank: 2, basePoints: 850, streak: 2, points: 893 });
    expect(by.c).toMatchObject({ correct: false, targetId: null, points: 0, streak: 0 });
    expect(by.d).toBeUndefined();
  });
  it('ein einzelner richtiger Tipp erhält 1000 Basispunkte', () => {
    const out = scoreRound({
      ownerId: 'o',
      eligible: ['a', 'b', 'c'],
      votes: [
        { voterId: 'a', targetId: 'b', elapsedMs: 100 },
        { voterId: 'b', targetId: 'c', elapsedMs: 200 },
        { voterId: 'c', targetId: 'o', elapsedMs: 9000 }
      ],
      streaks: new Map()
    });
    expect(out.find((o) => o.voterId === 'c')!.points).toBe(1000);
  });
});
