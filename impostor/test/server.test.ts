import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { GameServer } from '../server/app.ts';
import { WORDS } from '../server/words.ts';
import { PROTOCOL_VERSION, type ClientCommand, type ClientView, type ServerMessage } from '../shared/protocol.ts';

let server: GameServer;
let url: string;

before(async () => {
  server = new GameServer({ staticDir: null, log: () => {} });
  const port = await server.listen(0, '127.0.0.1');
  url = `ws://127.0.0.1:${port}/ws`;
});

after(async () => {
  await server.shutdown();
});

let actionSeq = 0;

/** Unabhängiger Test-Client, der alle rohen Frames mitschneidet. */
class Client {
  ws!: WebSocket;
  raw: string[] = [];
  token: string | null = null;
  playerId = '';
  view: ClientView | null = null;
  private waiters: { pred: () => boolean; res: () => void }[] = [];
  private acks = new Map<string, ServerMessage>();

  constructor(public name: string) {}

  async connect(token: string | null = this.token): Promise<void> {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => {
      const s = d.toString();
      this.raw.push(s);
      const msg = JSON.parse(s) as ServerMessage;
      if (msg.type === 'welcome') {
        this.token = msg.token;
        this.playerId = msg.playerId;
      } else if (msg.type === 'state') this.view = msg.view;
      else if (msg.type === 'ack') this.acks.set(msg.actionId, msg);
      this.flush();
    });
    await new Promise<void>((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
    this.ws.send(JSON.stringify({ type: 'hello', token, profile: { name: this.name, avatar: 1 }, protocol: PROTOCOL_VERSION }));
    await this.until(() => this.playerId !== '' && this.raw.some((r) => r.includes('"state"')));
  }

  private flush() {
    this.waiters = this.waiters.filter((w) => {
      if (w.pred()) {
        w.res();
        return false;
      }
      return true;
    });
  }

  until(pred: () => boolean, ms = 2000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`Timeout bei ${this.name}`)), ms);
      this.waiters.push({
        pred,
        res: () => {
          clearTimeout(timer);
          res();
        },
      });
    });
  }

  async send(cmd: ClientCommand, actionId = `a${++actionSeq}`): Promise<ServerMessage & { type: 'ack' }> {
    this.ws.send(JSON.stringify({ type: 'cmd', actionId, cmd }));
    await this.until(() => this.acks.has(actionId));
    return this.acks.get(actionId) as ServerMessage & { type: 'ack' };
  }

  close() {
    this.ws.close();
  }
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function lobbyOf(n: number): Promise<Client[]> {
  const clients = Array.from({ length: n }, (_, i) => new Client(`C${i + 1}`));
  for (const c of clients) await c.connect();
  await clients[0].send({ t: 'createLobby' });
  const code = clients[0].view!.lobby.code;
  for (const c of clients.slice(1)) {
    const r = await c.send({ t: 'joinLobby', code: code.toLowerCase() });
    assert.equal(r.ok, true);
  }
  await settle();
  return clients;
}

async function start(clients: Client[]) {
  for (const c of clients) await c.send({ t: 'setReady', ready: true });
  const r = await clients[0].send({ t: 'startMatch' });
  assert.equal(r.ok, true, JSON.stringify(r));
  await settle();
  for (const c of clients) await c.send({ t: 'ackRole' });
  await settle();
}

describe('Multiplayer über echte WebSockets', () => {
  it('vier Clients spielen mehrere Partien; der Impostor erhält das Wort nie vor der Auflösung', async () => {
    const clients = await lobbyOf(4);
    for (let match = 0; match < 3; match++) {
      for (const c of clients) c.raw = [];
      await start(clients);
      const impostor = clients.find((c) => c.view!.private!.role === 'impostor')!;
      const insiders = clients.filter((c) => c !== impostor);
      const words = insiders.map((c) => c.view!.private!.word);
      assert.equal(new Set(words).size, 1);
      const entry = WORDS.find((w) => w.word === words[0])!;
      // Ein paar Hinweise spielen
      for (let i = 0; i < 4; i++) {
        const activeId = clients[0].view!.match!.activePlayerId;
        const active = clients.find((c) => c.playerId === activeId)!;
        assert.equal((await active.send({ t: 'submitClue', text: `Hinweis ${match}-${i}` })).ok, true);
      }
      await settle();
      // Geheimhaltung auf Transportebene: alle rohen Frames des Impostors bis hier
      const blob = impostor.raw.join('\n');
      for (const s of [entry.word, ...entry.aliases, entry.id]) {
        assert.ok(!blob.includes(JSON.stringify(s)), `„${s}" wurde an den Impostor gesendet`);
      }
      assert.ok(!blob.includes(entry.id.split(':')[1] + '"'));
      // Abwechselnd durch Rateversuch bzw. Abstimmung beenden
      if (match % 2 === 0) {
        assert.equal((await impostor.send({ t: 'guessWord', text: entry.word })).ok, true);
      } else {
        for (const c of clients) await c.send({ t: 'proposeVote' });
        for (const c of clients) await c.send({ t: 'readyToVote' });
        for (const c of insiders) await c.send({ t: 'castVote', targetId: impostor.playerId });
        await impostor.send({ t: 'castVote', targetId: insiders[0].playerId });
      }
      await settle();
      await settle();
      const result = clients[0].view!.lastResult!;
      assert.equal(result.outcome, 'win');
      assert.equal(result.impostorId, impostor.playerId);
      assert.equal(result.word, entry.word);
      assert.equal(clients[0].view!.lobby.phase, 'lobby');
    }
    for (const c of clients) c.close();
  });

  it('Doppelklick / Retry mit derselben Aktions-ID wird genau einmal ausgewertet', async () => {
    const clients = await lobbyOf(4);
    await start(clients);
    const impostor = clients.find((c) => c.view!.private!.role === 'impostor')!;
    const r1 = await impostor.send({ t: 'guessWord', text: 'Sicher falsch' }, 'dup-guess');
    const r2 = await impostor.send({ t: 'guessWord', text: 'Sicher falsch' }, 'dup-guess');
    assert.deepEqual(r1, r2);
    await settle();
    const scores = clients[0].view!.lobby.players.map((p) => p.score).sort();
    assert.deepEqual(scores, [0, 1, 1, 1], 'Punkte nur einmal vergeben');
    for (const c of clients) c.close();
  });

  it('Wiederverbindung stellt dieselbe Identität und Rolle wieder her, ohne fremde Daten', async () => {
    const clients = await lobbyOf(4);
    await start(clients);
    const c = clients[2];
    const role = c.view!.private!.role;
    const word = c.view!.private!.word;
    const id = c.playerId;
    c.close();
    await clients[0].until(() => clients[0].view!.match!.paused !== null);
    assert.deepEqual(clients[0].view!.match!.paused!.playerIds, [id]);
    await c.connect(c.token);
    assert.equal(c.playerId, id);
    await c.until(() => c.view?.match != null);
    assert.equal(c.view!.private!.role, role);
    assert.equal(c.view!.private!.word, word);
    await clients[0].until(() => clients[0].view!.match!.paused === null);
    for (const x of clients) x.close();
  });

  it('der Lobbycode allein übernimmt keine bestehende Identität', async () => {
    const clients = await lobbyOf(3);
    const intruder = new Client('Fremd');
    await intruder.connect(null);
    await intruder.send({ t: 'joinLobby', code: clients[0].view!.lobby.code });
    await settle();
    assert.notEqual(intruder.playerId, clients[0].playerId);
    assert.equal(clients[0].view!.lobby.players.length, 4);
    const fake = new Client('Fake');
    await fake.connect('ausgedachtes-token');
    assert.ok(fake.raw.some((r) => r.includes('"sessionReset":true')));
    assert.equal(fake.view, null);
    for (const x of [...clients, intruder, fake]) x.close();
  });

  it('Code nicht gefunden, manipulierte Nachrichten und falsche Phasen werden abgelehnt', async () => {
    const [a, b, c] = await lobbyOf(3);
    const nf = new Client('X');
    await nf.connect();
    assert.equal((await nf.send({ t: 'joinLobby', code: 'ZZZZZ' })).ok, false);
    assert.equal(((await nf.send({ t: 'joinLobby', code: 'AAAAA' })) as { code?: string }).code, 'not_found');
    assert.equal((await b.send({ t: 'startMatch' })).ok, false);
    assert.equal((await a.send({ t: 'submitClue', text: 'x' })).ok, false);
    assert.equal((await a.send({ t: 'nonsense' } as never)).ok, false);
    assert.equal((await a.send({ t: 'castVote', targetId: { $ne: 1 } } as never)).ok, false);
    assert.equal((await a.send({ t: 'updateSettings', settings: { turnSeconds: 1 } } as never)).ok, false);
    assert.equal((await a.send({ t: 'setProfile', profile: { name: '<img src=x onerror=alert(1)>', avatar: 2 } })).ok, true);
    await settle();
    // Namen werden als Text übertragen – Rendering erfolgt im Client ausschließlich als Text.
    assert.equal(b.view!.lobby.players[0].name, '<img src=x onerr');
    // Übergroße Nachricht schließt die Verbindung
    const closed = new Promise((res) => c.ws.once('close', res));
    c.ws.send(JSON.stringify({ type: 'cmd', actionId: 'big', cmd: { t: 'chat', text: 'x'.repeat(10_000) } }));
    await closed;
    for (const x of [a, b, nf]) x.close();
  });

  it('unterschiedliche Lobbys bleiben voneinander isoliert', async () => {
    const one = await lobbyOf(3);
    const two = await lobbyOf(3);
    await one[0].send({ t: 'chat', text: 'Nur für Lobby eins' });
    await start(one);
    await settle();
    for (const c of two) {
      assert.ok(!c.raw.join('').includes('Nur für Lobby eins'));
      assert.equal(c.view!.lobby.phase, 'lobby');
      assert.equal(c.view!.lobby.players.length, 3);
    }
    assert.notEqual(one[0].view!.lobby.code, two[0].view!.lobby.code);
    for (const c of [...one, ...two]) c.close();
  });

  it('Spam wird gebremst', async () => {
    const [a, b, c] = await lobbyOf(3);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => a.send({ t: 'chat', text: `m${i}` })));
    assert.ok(results.some((r) => !r.ok && (r as { code: string }).code === 'rate_limited'));
    for (const x of [a, b, c]) x.close();
  });
});
