import { afterEach, describe, expect, it } from 'vitest';
import type { RoomView } from '@liked/protocol';
import { Bot, expectOk, lobbyOf, sleep, startServer, until, type Srv } from './helpers.js';

let server: Srv | null = null;
let bots: Bot[] = [];

afterEach(async () => {
  bots.forEach((b) => b.close());
  bots = [];
  await server?.close();
  server = null;
});

async function setup(n = 4) {
  const s = await startServer();
  server = s.server;
  bots = await lobbyOf(s.url, n);
  return { ...s, bots };
}

const ownerOf = (code: string) => server!.rooms.get(code)!.match!.current!.ownerId;

/** Entfernt nur die persönlichen Felder; der Rest muss für alle identisch sein. */
function publicPart(v: RoomView) {
  const c = structuredClone(v) as unknown as Record<string, unknown> & { round?: Record<string, unknown> | null };
  delete c.youId;
  if (c.round) {
    delete c.round.you;
    delete c.round.answerOptions;
  }
  return c;
}

describe('Lobby', () => {
  it('startet erst mit mindestens drei bereiten Spielern und nennt die Ursache', async () => {
    const { bots } = await setup(2);
    await bots[0]!.prepareLobby();
    await bots[1]!.prepareLobby();
    const r = await bots[0]!.emit('start');
    expect(r).toEqual({ ok: false, error: 'cannot_start' });
    expect(bots[0]!.view!.startBlockers).toContainEqual({ kind: 'too_few_players', have: 2, need: 3 });
  });

  it('meldet zu wenige Clips ohne Clips offenzulegen und Einstellungsänderung setzt Ready zurück', async () => {
    const { bots } = await setup(3);
    for (const b of bots) await b.prepareLobby(12);
    expectOk(await bots[0]!.emit('updateSettings', { clipsPerPerson: 10 }));
    await until(() => bots[1]!.view?.settings.clipsPerPerson === 10);
    expect(bots[1]!.view!.players.every((p) => !p.ready)).toBe(true);
    // 12 Kandidaten reichen für 10 Clips
    expect(bots[1]!.view!.players.every((p) => p.poolStatus === 'ok')).toBe(true);
    expectOk(await bots[2]!.emit('submitPool', bots[2]!.pool(6)));
    await until(() => bots[0]!.view?.players.find((p) => p.id === bots[2]!.playerId)?.poolStatus === 'insufficient');
    expect(JSON.stringify(bots[0]!.view)).not.toContain('demo-');
    expect(await bots[2]!.emit('setReady', { ready: true })).toEqual({ ok: false, error: 'cannot_start' });
  });

  it('Nicht-Host darf weder starten noch entfernen; Host kann entfernen', async () => {
    const { bots } = await setup(3);
    expect(await bots[1]!.emit('start')).toEqual({ ok: false, error: 'not_host' });
    expect(await bots[1]!.emit('kick', { playerId: bots[2]!.playerId })).toEqual({ ok: false, error: 'not_host' });
    expectOk(await bots[0]!.emit('kick', { playerId: bots[2]!.playerId }));
    await until(() => bots[2]!.kicked);
    await until(() => bots[0]!.view!.players.length === 2);
  });

  it('lehnt Demo-Pools in TikTok-Räumen ab', async () => {
    const s = await startServer();
    server = s.server;
    const a = new Bot(s.url, 'Anna');
    bots = [a];
    await a.create('tiktok');
    expect(await a.emit('submitPool', a.pool())).toEqual({ ok: false, error: 'mode_mismatch' });
  });

  it('validiert Namen und Nutzdaten', async () => {
    const s = await startServer();
    server = s.server;
    const a = new Bot(s.url, 'Anna');
    bots = [a];
    await a.connected();
    const r = await a.emit('createRoom', { profile: { name: 'x', avatar: 'fox', deviceId: 'short' }, mode: 'demo', protocolVersion: 1 });
    expect(r).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await a.emit('joinRoom', { code: 'ZZZZZZ', profile: a.profile(), protocolVersion: 1 })).toEqual({ ok: false, error: 'room_not_found' });
  });
});

describe('Komplette Partie mit vier Clients (Abnahme 1 lokal, 4, 8, 9)', () => {
  it('spielt 20 Runden, hält die Lösung geheim und wertet serverseitig', async () => {
    const { bots } = await setup(4);
    const code = bots[0]!.code;
    // Bot 1 und 2 raten immer richtig, Bot 3 immer falsch, Bot 4 richtig.
    const rightFor = new Set([bots[0]!.playerId, bots[1]!.playerId, bots[3]!.playerId]);
    const secrecyViolations: string[] = [];
    for (const b of bots) {
      b.choose = (v) => {
        const owner = ownerOf(code);
        if (rightFor.has(b.playerId)) return owner;
        return v.round!.answerOptions.find((id) => id !== owner)!;
      };
    }
    for (const b of bots) await b.prepareLobby();
    expectOk(await bots[0]!.emit('start'));

    // Geheimhaltung: In jeder Rundenphase sind die öffentlichen Teile aller Sichten gleich.
    const check = setInterval(() => {
      const vs = bots.map((b) => b.view!);
      if (!vs.every((v) => v && v.round && v.phase !== 'LOBBY')) return;
      if (new Set(vs.map((v) => v.version)).size !== 1) return;
      const p0 = JSON.stringify(publicPart(vs[0]!));
      for (const v of vs) {
        if (JSON.stringify(publicPart(v)) !== p0) secrecyViolations.push(`version ${v.version}`);
        if (v.reveal) secrecyViolations.push('reveal während Runde');
      }
      const owners = vs.filter((v) => v.round!.you.role === 'owner');
      if (owners.length > 1) secrecyViolations.push('mehrere Besitzer');
    }, 1);

    await until(() => bots[0]!.view?.phase === 'RESULTS', 15000, 'Ergebnis');
    clearInterval(check);
    expect(secrecyViolations).toEqual([]);

    const results = bots[0]!.view!.results!;
    expect(results.completedBlocks).toBe(5);
    expect(results.endReason).toBe('complete');
    const st = new Map(results.standings.map((s) => [s.playerId, s]));
    // Jeder hatte 15 Ratechancen (20 Runden − 5 eigene Clips).
    for (const b of bots) expect(st.get(b.playerId)!.opportunities).toBe(15);
    expect(st.get(bots[2]!.playerId)!.score).toBe(0);
    expect(st.get(bots[2]!.playerId)!.correct).toBe(0);
    for (const i of [0, 1, 3]) {
      expect(st.get(bots[i]!.playerId)!.correct).toBe(15);
      // Streak bleibt über eigene Clips hinweg erhalten → 15er-Serie
      expect(st.get(bots[i]!.playerId)!.longestStreak).toBe(15);
    }
    // Serverwertung: Summe der Punkte je Runde passt zur Formel (drei Berechtigte, 1000/850/700 × Streak)
    const total = results.standings.reduce((a, s) => a + s.score, 0);
    expect(total).toBeGreaterThan(15 * 3 * 700);
    // Reveal-Sichten enthielten die Auflösung, jede Runde genau eine
    const reveals = new Set(bots[0]!.views.filter((v) => v.reveal).map((v) => v.reveal!.roundId));
    expect(reveals.size).toBe(20);
    // Besitzer nie in eigenem Reveal als Abstimmender
    for (const v of bots[0]!.views.filter((x) => x.reveal))
      expect(v.reveal!.votes.map((x) => x.voterId)).not.toContain(v.reveal!.ownerId);
  }, 30000);
});

describe('Stimmen und Reconnect (Abnahme 9, 10)', () => {
  it('Doppelstimme, Retry, Reconnect mit bestätigter Stimme', async () => {
    const { bots } = await setup(4);
    const code = bots[0]!.code;
    for (const b of bots) await b.prepareLobby();
    // Nur automatisch laden/starten, nicht automatisch abstimmen.
    expectOk(await bots[0]!.emit('start'));
    await until(() => bots[0]!.view?.phase === 'PLAYING_AND_VOTING', 5000, 'Spielphase');
    const owner = ownerOf(code);
    const voter = bots.find((b) => b.playerId !== owner)!;
    const roundId = voter.view!.round!.roundId;
    const other = voter.view!.round!.answerOptions.find((id) => id !== owner)!;
    const v1 = await voter.emit<{ vote: { targetId: string } }>('vote', { roundId, targetId: owner, voteId: 'vote_aaaaaaaa' });
    const v2 = await voter.emit<{ vote: { targetId: string } }>('vote', { roundId, targetId: other, voteId: 'vote_bbbbbbbb' });
    const v3 = await voter.emit<{ vote: { targetId: string } }>('vote', { roundId, targetId: owner, voteId: 'vote_aaaaaaaa' });
    expect(v1.ok && v1.vote.targetId).toBe(owner);
    expect(v2.ok && v2.vote.targetId).toBe(owner);
    expect(v3.ok && v3.vote.targetId).toBe(owner);
    await until(() => voter.view!.round?.votesIn === 1);

    await voter.disconnect();
    await until(() => bots.find((b) => b !== voter)!.view!.players.find((p) => p.id === voter.playerId)!.connected === false);
    const res = await voter.reconnect();
    expectOk(res);
    await until(() => voter.view?.round?.you.vote?.targetId === owner, 3000, 'Stimme nach Reconnect');
    expect(voter.view!.round!.you.vote!.confirmed).toBe(true);

    // Andere Stimmen, Runde endet
    for (const b of bots) if (b.playerId !== owner && b !== voter)
      await b.emit('vote', { roundId, targetId: owner, voteId: `vote_${b.name}xxxx` });
    await until(() => bots[0]!.view?.phase === 'REVEAL', 5000, 'Reveal');
    const reveal = bots[0]!.view!.reveal!;
    expect(reveal.votes.find((x) => x.voterId === voter.playerId)!.points).toBeGreaterThan(0);
    const pointsSum = reveal.votes.reduce((a, x) => a + x.points, 0);
    // Verspätete Stimme einer alten Runde wird verworfen, ohne Punkte zu ändern
    const late = await bots.find((b) => b.playerId !== owner && b !== voter)!.emit('vote', { roundId: 'rd_old', targetId: owner, voteId: 'vote_late0001' });
    expect(late).toEqual({ ok: false, error: 'round_mismatch' });
    await sleep(30);
    const reveal2 = server!.rooms.get(code)!.reveal!;
    expect(reveal2.votes.reduce((a, x) => a + x.points, 0)).toBe(pointsSum);
  }, 20000);

  it('Wiederverbindung mit falschem Token schlägt fehl; Raumcode allein genügt nicht', async () => {
    const { bots } = await setup(3);
    const b = bots[1]!;
    await b.disconnect();
    b.token = 'x'.repeat(43);
    expect(await b.reconnect()).toEqual({ ok: false, error: 'invalid_token' });
  });

  it('Spieler ohne Reconnect innerhalb des Fensters wird entfernt, Host wechselt', async () => {
    const { bots } = await setup(3);
    await bots[0]!.disconnect();
    await until(() => bots[1]!.view!.players.length === 2, 3000, 'Entfernung');
    expect(bots[1]!.view!.hostId).toBe(bots[1]!.playerId);
    expect(bots[1]!.view!.notices.map((n) => n.kind)).toContain('host_changed');
  });
});

describe('Fehler und Fairness (Abnahme 7, 11)', () => {
  it('Ladefehler: Retry, danach Ersatzclip; Buffering annulliert neutral', async () => {
    const { bots } = await setup(3);
    const code = bots[0]!.code;
    for (const b of bots) await b.prepareLobby();
    bots[2]!.failLoad = true;
    expectOk(await bots[0]!.emit('start'));
    const room = server!.rooms.get(code)!;
    const firstClip = room.match!.current!.clip.videoId;
    const firstOwner = room.match!.current!.ownerId;
    await until(() => bots[0]!.view!.notices.some((n) => n.kind === 'clip_replaced'), 5000, 'Ersatz');
    // Ersatz vom selben Besitzer, anderer Clip
    expect(room.match!.current!.ownerId).toBe(firstOwner);
    expect(room.match!.current!.clip.videoId).not.toBe(firstClip);
    bots[2]!.failLoad = false;
    // Neuer Clip lädt beim nächsten Versuch
    await until(() => bots[0]!.view?.phase === 'PLAYING_AND_VOTING', 5000, 'Spielphase');

    // Buffering ohne Fortsetzung → Annullierung ohne Enthüllung
    const r = bots.find((b) => b.view!.round!.you.role === 'voter')!;
    const statsBefore = JSON.stringify([...room.match!.stats]);
    const roundId = r.view!.round!.roundId;
    await r.emit('playback', { roundId, kind: 'buffering', position: 1 });
    await until(() => bots[0]!.view!.notices.some((n) => n.kind === 'round_voided'), 3000, 'Annullierung');
    expect(JSON.stringify([...room.match!.stats])).toBe(statsBefore);
    expect(bots[0]!.views.some((v) => v.reveal?.roundId === roundId)).toBe(false);
    // Annullierter Clip kehrt nicht zurück
    expect(room.match!.usedClipIds.has(room.match!.current!.clip.videoId)).toBe(true);
  }, 20000);

  it('dauerhaftes Ausscheiden im zweiten Block rollt zurück und wertet den ersten Block', async () => {
    const { bots } = await setup(4);
    const code = bots[0]!.code;
    for (const b of bots) b.choose = () => ownerOf(code);
    for (const b of bots) await b.prepareLobby();
    expectOk(await bots[0]!.emit('start'));
    const room = server!.rooms.get(code)!;
    await until(() => room.match!.scoredRounds >= 5 && room.phase === 'PLAYING_AND_VOTING', 10000, 'Block 2');
    const leaver = bots[3]!;
    leaver.auto = false;
    await leaver.emit('leaveRoom');
    await until(() => bots[0]!.view?.phase === 'RESULTS', 5000, 'Ergebnis');
    const res = bots[0]!.view!.results!;
    expect(res.completedBlocks).toBe(1);
    expect(res.endReason).toBe('player_left');
    for (const s of res.standings) expect(s.opportunities).toBe(3);
    expect(bots[0]!.view!.notices.map((n) => n.kind)).toContain('rolled_back');
  }, 20000);

  it('Abbruch im ersten Block führt zurück in die Lobby', async () => {
    const { bots } = await setup(3);
    for (const b of bots) await b.prepareLobby();
    expectOk(await bots[0]!.emit('start'));
    await until(() => bots[0]!.view?.phase === 'PLAYING_AND_VOTING');
    await bots[2]!.emit('leaveRoom');
    await until(() => bots[0]!.view?.phase === 'LOBBY');
    expect(bots[0]!.view!.notices.map((n) => n.kind)).toContain('match_aborted');
  });

  it('neue Personen warten während der Partie auf die Lobby', async () => {
    const s = await setup(3);
    for (const b of s.bots) await b.prepareLobby();
    expectOk(await s.bots[0]!.emit('start'));
    const late = new Bot(s.url, 'Spät');
    bots.push(late);
    await late.join(s.bots[0]!.code);
    await until(() => late.view);
    expect(late.view!.players.find((p) => p.id === late.playerId)!.waiting).toBe(true);
    expect(late.view!.round).toBeNull();
  });
});

describe('Ressourcen (Abnahme 15)', () => {
  it('nach mehreren Partien sammeln sich weder Timer noch Räume an', async () => {
    const { bots } = await setup(3);
    const code = bots[0]!.code;
    for (const b of bots) b.choose = () => ownerOf(code);
    const room = server!.rooms.get(code)!;
    for (let game = 0; game < 3; game++) {
      for (const b of bots) await b.prepareLobby(40);
      expectOk(await bots[0]!.emit('start'));
      await until(() => bots[0]!.view?.phase === 'RESULTS', 15000, `Partie ${game} ${room.phase} ${JSON.stringify(room.startBlockers())} ${room.match?.scoredRounds}`);
      expect(room.timerCount).toBe(0);
      expectOk(await bots[0]!.emit('rematch'));
      await until(() => bots[0]!.view?.phase === 'LOBBY');
    }
    // Revanche: keine Wiederholung bereits gespielter Clips über Partien hinweg
    expect(room.playedIds.size).toBe(3 * 15);
    expect(server!.io.engine.clientsCount).toBe(3);
    bots.forEach((b) => b.close());
    await until(() => [...room.players.values()].every((p) => !p.connected));
    await until(() => room.closed || room.players.size === 0, 3000, 'Aufräumen');
    expect(room.timerCount).toBe(0);
  }, 60000);
});

describe('Protokolle (Abnahme 13)', () => {
  it('enthalten keine Clip-IDs, Namen oder Tokens', async () => {
    const { bots } = await setup(3);
    const code = bots[0]!.code;
    for (const b of bots) b.choose = () => ownerOf(code);
    for (const b of bots) await b.prepareLobby();
    expectOk(await bots[0]!.emit('start'));
    await until(() => bots[0]!.view?.phase === 'RESULTS', 15000);
    const logs = server!.log.lines!.join('\n');
    expect(logs).not.toMatch(/demo-/);
    expect(logs).not.toContain('Spieler1');
    expect(logs).not.toContain(bots[0]!.token);
    expect(logs).not.toContain(bots[0]!.playerId);
    expect(logs).toContain('match_finished');
  }, 20000);
});

describe('Rate-Limits', () => {
  it('begrenzt Beitrittsversuche je IP und berücksichtigt X-Forwarded-For nur mit TRUST_PROXY', async () => {
    const s = await startServer({ trustProxy: true });
    server = s.server;
    const host = new Bot(s.url, 'Host', { 'x-forwarded-for': '203.0.113.1' });
    bots = [host];
    await host.create('demo');
    // Ein Angreifer rät Codes: nach 10 Versuchen gesperrt.
    const attacker = new Bot(s.url, 'Rater', { 'x-forwarded-for': '198.51.100.7' });
    bots.push(attacker);
    await attacker.connected();
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await attacker.emit('joinRoom', { code: 'AAAAA' + (i % 10), profile: attacker.profile(), protocolVersion: 1 });
      results.push(r.ok ? 'ok' : r.error!);
    }
    expect(results.slice(0, 10).every((e) => e === 'room_not_found')).toBe(true);
    expect(results.slice(10)).toEqual(['rate_limited', 'rate_limited']);
    // Andere Spieler hinter demselben Proxy sind davon nicht betroffen.
    const friend = new Bot(s.url, 'Freund', { 'x-forwarded-for': '192.0.2.44' });
    bots.push(friend);
    await friend.join(host.code);
    expect(friend.playerId).toMatch(/^p_/);
  });
});
