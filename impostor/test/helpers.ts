import { Lobby } from '../server/lobby.ts';
import type { ClientCommand, ClientView, LobbySettings, PlayerId } from '../shared/protocol.ts';
import { WORDS } from '../server/words.ts';

export class FakeClock {
  t = 1_000_000;
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

let idSeq = 0;
export function makeEnv(clock: FakeClock, seed = 42) {
  let s = seed;
  const rand = () => {
    // xorshift – deterministisch für Tests
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return {
    now: clock.now,
    randomInt: (n: number) => Math.floor(rand() * n),
    newId: () => `id-${++idSeq}`,
  };
}

export interface Table {
  clock: FakeClock;
  lobby: Lobby;
  ids: PlayerId[];
  cmd(p: PlayerId, c: ClientCommand): ReturnType<Lobby['handle']>;
  view(p: PlayerId): ClientView;
  impostor(): PlayerId;
  insiders(): PlayerId[];
  active(): PlayerId | null;
  advance(ms: number): void;
  giveClue(text?: string): void;
}

let clueSeq = 0;

export function setupTable(n = 4, settings: Partial<LobbySettings> = {}, seed = 42): Table {
  const clock = new FakeClock();
  const lobby = new Lobby('TEST1', makeEnv(clock, seed));
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  ids.forEach((id, i) => {
    lobby.join(id, { name: `Spieler ${i + 1}`, avatar: i % 12 });
    clock.advance(10);
  });
  const t: Table = {
    clock,
    lobby,
    ids,
    cmd: (p, c) => lobby.handle(p, c),
    view: (p) => lobby.viewFor(p)!,
    impostor: () => ids.find((id) => lobby.viewFor(id)!.private?.role === 'impostor')!,
    insiders: () => ids.filter((id) => lobby.viewFor(id)!.private?.role === 'insider'),
    active: () => lobby.viewFor(ids[0])!.match?.activePlayerId ?? null,
    advance: (ms) => {
      clock.advance(ms);
      lobby.tick();
    },
    giveClue: (text) => {
      const a = t.active();
      if (!a) throw new Error('kein aktiver Spieler');
      const r = lobby.handle(a, { t: 'submitClue', text: text ?? `Hinweis ${++clueSeq}` });
      if (!r.ok) throw new Error(`Hinweis abgelehnt: ${r.code}`);
    },
  };
  if (Object.keys(settings).length) {
    const r = lobby.handle(ids[0], { t: 'updateSettings', settings });
    if (!r.ok) throw new Error('settings');
  }
  return t;
}

export function startMatch(t: Table): void {
  for (const id of t.ids) t.cmd(id, { t: 'setReady', ready: true });
  const r = t.cmd(t.ids[0], { t: 'startMatch' });
  if (!r.ok) throw new Error(`start: ${r.code}`);
}

export function ackAll(t: Table): void {
  for (const id of t.ids) t.cmd(id, { t: 'ackRole' });
}

export function secretStrings(word: string): string[] {
  const entry = WORDS.find((w) => w.word === word)!;
  return [entry.word, ...entry.aliases, entry.id];
}
