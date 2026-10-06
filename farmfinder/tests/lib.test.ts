import { describe, expect, it } from 'vitest';
import { detectVersions, matchVersion, compareVersions } from '../src/lib/versions';
import { extractRate, parseItemList, estimateDifficulty, estimateEfficiency, sortFarms, buildFarm } from '../src/lib/analyze';
import { breakdown, formatBreakdown } from '../src/lib/stacks';
import { findItem } from '../src/lib/items';
import { resolveQuery } from '../src/lib/catalog';
import { parseVideoId, parseDuration } from '../src/lib/youtube';

describe('Versionen', () => {
  it('erkennt Versionen, ignoriert Zeitstempel und Faktoren', () => {
    expect(detectVersions('Bone Meal Farm 1.21.4 & 26.3 | 1:21 Intro | 1.5x')).toEqual(['26.3', '1.21.4']);
    expect(detectVersions('works in 1.20+')).toEqual(['1.20+']);
  });
  it('vergleicht numerisch', () => {
    expect(compareVersions('1.9', '1.21')).toBeLessThan(0);
    expect(compareVersions('26.3', '1.21.9')).toBeGreaterThan(0);
  });
  it('matcht Familie, Plus-Angaben und unbekannt', () => {
    expect(matchVersion(['1.21.4'], '1.21')).toBe('yes');
    expect(matchVersion(['1.20'], '1.21')).toBe('no');
    expect(matchVersion(['1.20+'], '26.3')).toBe('yes');
    expect(matchVersion([], '26.3')).toBe('unknown');
    expect(matchVersion(['1.8'], null)).toBe('yes');
  });
});

describe('Analyse', () => {
  it('liest Raten', () => {
    expect(extractRate('Bis zu 10k/h')).toBe(10000);
    expect(extractRate('12,000 items per hour')).toBe(12000);
    expect(extractRate('3000 pro Stunde')).toBe(3000);
    expect(extractRate('kein Wert')).toBeUndefined();
  });
  it('schätzt Schwierigkeit und Effizienz', () => {
    expect(estimateDifficulty('Easy small starter bone meal farm', '', 200)).toBeLessThanOrEqual(2);
    expect(estimateDifficulty('Massive fully automatic farm', '', 1500)).toBe(5);
    expect(estimateEfficiency('x', '', 0, 0, 25000)).toBe(5);
    expect(estimateEfficiency('Simple starter farm', '')).toBeLessThan(3);
  });
  it('parst Materiallisten und ignoriert Zeitstempel/Fließtext', () => {
    const items = parseItemList(
      ['0:00 Intro', '- 64x Hopper', 'Beobachter x 12', '3 Chest', 'Redstone Dust: 40', 'Das ist ein langer Satz mit Zahl 5', '10 Hopper'].join('\n'),
    );
    expect(items).toContainEqual({ name: 'Hopper', count: 74 });
    expect(items).toContainEqual({ name: 'Observer', count: 12 });
    expect(items).toContainEqual({ name: 'Chest', count: 3 });
    expect(items).toContainEqual({ name: 'Redstone Dust', count: 40 });
    expect(items.some((i) => /Intro|Satz/.test(i.name))).toBe(false);
  });
  it('sortiert nach Kriterium', () => {
    const mk = (id: string, e: number, d: number, views: number) =>
      ({ ...buildFarm({ videoId: id, title: id, channel: '', thumbnail: '', description: '', views }), efficiency: e, difficulty: d }) as ReturnType<typeof buildFarm>;
    const farms = [mk('a', 5, 5, 10), mk('b', 3, 1, 5), mk('c', 4, 2, 100)];
    expect(sortFarms(farms, 'efficiency')[0].id).toBe('a');
    expect(sortFarms(farms, 'easy')[0].id).toBe('b');
    expect(sortFarms(farms, 'popular')[0].id).toBe('c');
    expect(sortFarms(farms, 'balance')[0].id).toBe('c');
  });
});

describe('Items, Stacks, Katalog, YouTube', () => {
  it('findet Items deutsch/englisch', () => {
    expect(findItem('Trichter')?.en).toBe('Hopper');
    expect(findItem('hoppers')?.en).toBe('Hopper');
    expect(findItem('Beobachter')?.en).toBe('Observer');
    expect(findItem('xyz')).toBeUndefined();
  });
  it('rechnet Stacks und Shulker', () => {
    expect(breakdown(64 * 27 * 2 + 64 * 3 + 5)).toEqual({ shulkers: 2, stacks: 3, rest: 5 });
    expect(formatBreakdown(130)).toBe('2 Stacks + 2');
    expect(formatBreakdown(40, 16)).toBe('2 Stacks + 8');
  });
  it('mappt deutsche Suchbegriffe', () => {
    const r = resolveQuery('Knochenmehl-Farm', '26.3');
    expect(r.type?.id).toBe('bonemeal');
    expect(r.ytQuery).toBe('minecraft bone meal farm tutorial 26.3');
  });
  it('parst Video-URLs und Dauer', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('nope')).toBeUndefined();
    expect(parseDuration('PT1H2M3S')).toBe(3723);
  });
});
