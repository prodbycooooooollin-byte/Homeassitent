import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TIMINGS } from '../shared/protocol.ts';
import { WORDS, isCorrectGuess, normalizeAnswer } from '../server/words.ts';
import { ackAll, secretStrings, setupTable, startMatch } from './helpers.ts';

describe('Wortliste', () => {
  it('hat mindestens 200 Begriffe mit eindeutigen IDs in allen 8 Kategorien', () => {
    assert.ok(WORDS.length >= 200, `nur ${WORDS.length}`);
    assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length);
    assert.equal(new Set(WORDS.map((w) => w.category)).size, 8);
  });

  it('normalisiert Rateversuche eng und deterministisch', () => {
    const fussball = WORDS.find((w) => w.word === 'Fußball')!;
    assert.ok(isCorrectGuess(fussball, 'fussball'));
    assert.ok(isCorrectGuess(fussball, '  FUSSBALL '));
    assert.ok(isCorrectGuess(fussball, 'Fußball'));
    assert.ok(!isCorrectGuess(fussball, 'Ball'), 'kein Teilstringvergleich');
    assert.ok(!isCorrectGuess(fussball, 'Fußballer'));
    assert.ok(!isCorrectGuess(fussball, ''));
    const pac = WORDS.find((w) => w.word === 'Pac-Man')!;
    assert.ok(isCorrectGuess(pac, 'pacman'));
    assert.ok(isCorrectGuess(pac, 'Pac Man'));
    const loewe = WORDS.find((w) => w.word === 'Löwe')!;
    assert.ok(isCorrectGuess(loewe, 'loewe'));
    const geld = WORDS.find((w) => w.word === 'Geldbörse')!;
    assert.ok(isCorrectGuess(geld, 'portemonnaie'), 'Alias');
    assert.equal(normalizeAnswer('Pokémon'), 'pokemon');
  });
});

describe('Lobby', () => {
  it('Start erst ab drei verbundenen, bereiten Personen', () => {
    const t = setupTable(2);
    for (const id of t.ids) t.cmd(id, { t: 'setReady', ready: true });
    assert.deepEqual(t.cmd(t.ids[0], { t: 'startMatch' }), { ok: false, code: 'not_enough_players' });
    t.lobby.join('p3', { name: 'Drei', avatar: 3 });
    assert.deepEqual(t.cmd(t.ids[0], { t: 'startMatch' }), { ok: false, code: 'not_all_ready' });
    t.cmd('p3', { t: 'setReady', ready: true });
    assert.deepEqual(t.cmd('p2', { t: 'startMatch' }), { ok: false, code: 'not_allowed' });
    assert.deepEqual(t.cmd(t.ids[0], { t: 'startMatch' }), { ok: true });
  });

  it('Regeländerungen setzen Bereit-Markierungen zurück; während der Partie gesperrt', () => {
    const t = setupTable(4);
    for (const id of t.ids) t.cmd(id, { t: 'setReady', ready: true });
    assert.equal(t.cmd('p2', { t: 'updateSettings', settings: { maxRounds: 5 } }).ok, false);
    assert.equal(t.cmd('p1', { t: 'updateSettings', settings: { maxRounds: 7 as never } }).ok, false);
    assert.equal(t.cmd('p1', { t: 'updateSettings', settings: { maxRounds: 5 } }).ok, true);
    assert.ok(t.view('p1').lobby.players.every((p) => !p.ready));
    startMatch(t);
    assert.deepEqual(t.cmd('p1', { t: 'updateSettings', settings: { maxRounds: 3 } }), {
      ok: false,
      code: 'wrong_phase',
    });
  });

  it('Host kann vor Spielbeginn entfernen; entfernte Person kommt nicht wieder rein', () => {
    const t = setupTable(4);
    assert.equal(t.cmd('p2', { t: 'kick', playerId: 'p3' }).ok, false);
    assert.equal(t.cmd('p1', { t: 'kick', playerId: 'p3' }).ok, true);
    assert.equal(t.lobby.has('p3'), false);
    assert.deepEqual(t.lobby.join('p3', { name: 'x', avatar: 0 }), { ok: false, code: 'kicked' });
  });

  it('Lobby voll ab 10 Personen', () => {
    const t = setupTable(10);
    assert.deepEqual(t.lobby.join('p11', { name: 'x', avatar: 0 }), { ok: false, code: 'lobby_full' });
  });

  it('Hostrolle geht an die am längsten anwesende verbundene Person', () => {
    const t = setupTable(4);
    t.lobby.setConnected('p2', false);
    t.lobby.leave('p1');
    assert.equal(t.view('p3').lobby.hostId, 'p3');
  });

  it('Getrennte Personen werden außerhalb einer Partie nach 60 s entfernt', () => {
    const t = setupTable(4);
    t.lobby.setConnected('p4', false);
    t.advance(TIMINGS.lobbyIdleRemoveMs - 1);
    assert.ok(t.lobby.has('p4'));
    t.advance(2);
    assert.ok(!t.lobby.has('p4'));
  });
});

describe('Rollen und Geheimhaltung', () => {
  it('genau drei erhalten dasselbe Wort, der Impostor zu keinem Zeitpunkt', () => {
    for (let seed = 1; seed < 30; seed++) {
      const t = setupTable(4, {}, seed);
      startMatch(t);
      const words = t.ids.map((id) => t.view(id).private!.word);
      const known = words.filter((w) => w !== null);
      assert.equal(known.length, 3);
      assert.equal(new Set(known).size, 1);
      const imp = t.impostor();
      const secrets = secretStrings(known[0]!);
      // Gesamte Sicht des Impostors (inkl. aller öffentlichen Daten) enthält das Wort nicht.
      ackAll(t);
      t.giveClue();
      t.giveClue();
      const json = JSON.stringify(t.view(imp));
      for (const s of secrets) {
        assert.ok(!json.includes(`"${s}"`), `Seed ${seed}: „${s}" in der Impostor-Sicht`);
      }
      assert.ok(!json.includes(':' + secrets[secrets.length - 1].split(':')[1] + '"'));
    }
  });

  it('niemand sieht fremde Rollen', () => {
    const t = setupTable(5);
    startMatch(t);
    for (const id of t.ids) {
      const v = t.view(id);
      assert.ok(!JSON.stringify(v.match).includes('impostor'), 'öffentliche Sicht ohne Rolleninformation');
    }
  });

  it('Rollen erst nach Bestätigung aller; Timeout nach 60 s beendet ohne Wertung', () => {
    const t = setupTable(4);
    startMatch(t);
    t.cmd('p1', { t: 'ackRole' });
    t.cmd('p2', { t: 'ackRole' });
    assert.equal(t.view('p1').match!.phase, 'roleReveal');
    t.advance(TIMINGS.roleRevealMs);
    const v = t.view('p1');
    assert.equal(v.lobby.phase, 'lobby');
    assert.equal(v.lastResult!.outcome, 'aborted');
    assert.equal(v.lastResult!.abortReason, 'role_timeout');
    assert.equal(v.lastResult!.word, null, 'Abbruch deckt nichts auf');
    assert.ok(v.lobby.players.every((p) => p.score === 0));
  });
});

describe('Hinweise', () => {
  it('nur die aktive Person darf einen Hinweis abgeben', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const active = t.active()!;
    const other = t.ids.find((i) => i !== active)!;
    assert.deepEqual(t.cmd(other, { t: 'submitClue', text: 'Test' }), { ok: false, code: 'not_your_turn' });
    assert.deepEqual(t.cmd(active, { t: 'submitClue', text: 'Ballon d’Or' }), { ok: true });
    assert.notEqual(t.active(), active);
  });

  it('leere, zu lange und doppelte Hinweise werden für alle Rollen gleich behandelt', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const a = t.active()!;
    assert.deepEqual(t.cmd(a, { t: 'submitClue', text: '   ' }), { ok: false, code: 'empty' });
    assert.deepEqual(t.cmd(a, { t: 'submitClue', text: 'x'.repeat(41) }), { ok: false, code: 'too_long' });
    assert.equal(t.cmd(a, { t: 'submitClue', text: 'x'.repeat(40) }).ok, true);
    const b = t.active()!;
    assert.deepEqual(t.cmd(b, { t: 'submitClue', text: ' ' + 'X'.repeat(40) }), { ok: false, code: 'duplicate' });
  });

  it('Hinweisvalidierung verrät dem Impostor nichts über das Wort', () => {
    for (let seed = 1; seed < 20; seed++) {
      const t = setupTable(4, {}, seed);
      startMatch(t);
      ackAll(t);
      const imp = t.impostor();
      const word = t.view(t.insiders()[0]).private!.word!;
      while (t.active() !== imp) t.giveClue();
      // Das geheime Wort als Hinweis: sozial verboten, technisch neutral angenommen.
      assert.deepEqual(t.cmd(imp, { t: 'submitClue', text: word }), { ok: true });
    }
  });

  it('abgelaufener Zugtimer erzeugt neutral „Kein Hinweis" und geht weiter', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const a = t.active();
    t.advance(30_000);
    const v = t.view('p1');
    assert.equal(v.match!.clues.length, 1);
    assert.equal(v.match!.clues[0].text, null);
    assert.equal(v.match!.clues[0].playerId, a);
    assert.notEqual(t.active(), a);
  });

  it('Startposition verschiebt sich pro Durchgang um einen Platz, Reihenfolge bleibt zyklisch', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const seat = t.view('p1').match!.seatOrder;
    const order: string[] = [];
    for (let i = 0; i < 12; i++) {
      order.push(t.active()!);
      t.giveClue();
    }
    const firstIdx = seat.indexOf(order[0]);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 4; k++) {
        assert.equal(order[r * 4 + k], seat[(firstIdx + r + k) % 4]);
      }
    }
  });

  it('nach dem letzten Durchgang beginnt die Diskussion automatisch', () => {
    const t = setupTable(4, { maxRounds: 3 });
    startMatch(t);
    ackAll(t);
    for (let i = 0; i < 12; i++) t.giveClue();
    const m = t.view('p1').match!;
    assert.equal(m.phase, 'discussion');
    assert.equal(m.voteKind, 'final');
  });
});

describe('Rateversuch', () => {
  it('richtige Antwort: sofortiger Sieg des Impostors', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const imp = t.impostor();
    const word = t.view(t.insiders()[0]).private!.word!;
    assert.deepEqual(t.cmd(imp, { t: 'guessWord', text: ` ${word.toUpperCase()} ` }), { ok: true });
    const r = t.view('p1').lastResult!;
    assert.equal(r.winner, 'impostor');
    assert.equal(r.reason, 'guess_correct');
    assert.equal(t.view(imp).lobby.players.find((p) => p.id === imp)!.score, 1);
  });

  it('falsche Antwort: sofortiger Sieg der Eingeweihten; kein zweiter Versuch', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    const imp = t.impostor();
    assert.deepEqual(t.cmd(imp, { t: 'guessWord', text: 'Definitiv falsch' }), { ok: true });
    const r = t.view('p1').lastResult!;
    assert.equal(r.winner, 'insider');
    assert.equal(r.reason, 'guess_wrong');
    assert.equal(r.guess, 'Definitiv falsch');
    assert.deepEqual(t.cmd(imp, { t: 'guessWord', text: 'nochmal' }).ok, false);
    const scores = t.view('p1').lobby.players;
    for (const p of scores) assert.equal(p.score, p.id === imp ? 0 : 1);
  });

  it('nur der Impostor darf raten; in der Rollenansicht und Wahl gesperrt ohne Verbrauch', () => {
    const t = setupTable(4, { maxRounds: 3 });
    startMatch(t);
    const imp = t.impostor();
    assert.deepEqual(t.cmd(imp, { t: 'guessWord', text: 'x' }), { ok: false, code: 'wrong_phase' });
    ackAll(t);
    assert.deepEqual(t.cmd(t.insiders()[0], { t: 'guessWord', text: 'x' }), { ok: false, code: 'not_allowed' });
    for (let i = 0; i < 12; i++) t.giveClue();
    assert.equal(t.view(imp).private!.canGuess, true, 'in der Diskussion erlaubt');
    t.advance(TIMINGS.discussionMs);
    assert.equal(t.view('p1').match!.phase, 'voting');
    assert.equal(t.view(imp).private!.canGuess, false);
    assert.deepEqual(t.cmd(imp, { t: 'guessWord', text: 'x' }), { ok: false, code: 'wrong_phase' });
    assert.equal(t.view(imp).private!.guessUsed, false);
  });

  it('Rateversuch und gleichzeitig ablaufender Timer erzeugen genau ein Ergebnis', () => {
    const t = setupTable(4, { maxRounds: 3 });
    startMatch(t);
    ackAll(t);
    for (let i = 0; i < 12; i++) t.giveClue();
    const imp = t.impostor();
    let results = 0;
    const orig = t.lobby.viewFor.bind(t.lobby);
    // Frist ist abgelaufen, aber der Tick noch nicht verarbeitet: Raten gewinnt (Ereignisreihenfolge).
    t.clock.advance(TIMINGS.discussionMs + 10);
    assert.equal(t.cmd(imp, { t: 'guessWord', text: 'falsch' }).ok, true);
    const first = orig('p1')!.lastResult!;
    t.lobby.tick();
    t.clock.advance(TIMINGS.votingMs + 10);
    t.lobby.tick();
    const after = orig('p1')!.lastResult!;
    if (first.matchId === after.matchId) results = 1;
    assert.equal(results, 1);
    assert.equal(after.reason, 'guess_wrong');
    assert.equal(t.view('p1').lobby.phase, 'lobby');
  });
});

describe('Abstimmungen', () => {
  function toFinalVote(n = 4) {
    const t = setupTable(n, { maxRounds: 3 });
    startMatch(t);
    ackAll(t);
    for (let i = 0; i < 3 * n; i++) t.giveClue();
    for (const id of t.ids) t.cmd(id, { t: 'readyToVote' });
    assert.equal(t.view('p1').match!.phase, 'voting');
    return t;
  }

  it('Mehrheit auf dem Impostor: Eingeweihte gewinnen', () => {
    const t = toFinalVote();
    const imp = t.impostor();
    const ins = t.insiders();
    assert.equal(t.view('p1').match!.votesNeeded, 3);
    for (const v of ins) t.cmd(v, { t: 'castVote', targetId: imp });
    assert.equal(t.view('p1').match!.phase, 'voting', 'Impostor hat noch nicht gewählt');
    t.cmd(imp, { t: 'castVote', targetId: ins[0] });
    const r = t.view('p1').lastResult!;
    assert.equal(r.winner, 'insider');
    assert.equal(r.reason, 'impostor_caught');
    assert.equal(r.votes!.length, 4);
  });

  it('Mehrheit auf einer unschuldigen Person: Impostor gewinnt', () => {
    const t = toFinalVote();
    const imp = t.impostor();
    const [a, b, c] = t.insiders();
    t.cmd(imp, { t: 'castVote', targetId: a });
    t.cmd(b, { t: 'castVote', targetId: a });
    t.cmd(c, { t: 'castVote', targetId: a });
    t.cmd(a, { t: 'castVote', targetId: imp });
    const r = t.view('p1').lastResult!;
    assert.equal(r.winner, 'impostor');
    assert.equal(r.reason, 'wrong_accusation');
    assert.equal(r.accusedId, a);
  });

  it('keine absolute Mehrheit in der Schlussabstimmung: Impostor gewinnt; Enthaltungen zählen', () => {
    const t = toFinalVote();
    const imp = t.impostor();
    const [a, b] = t.insiders();
    t.cmd(a, { t: 'castVote', targetId: imp });
    t.cmd(b, { t: 'castVote', targetId: imp });
    t.advance(TIMINGS.votingMs);
    const r = t.view('p1').lastResult!;
    assert.equal(r.winner, 'impostor');
    assert.equal(r.reason, 'no_majority');
    assert.equal(r.votes!.filter((v) => v.targetId === null).length, 2);
  });

  it('keine Selbstwahl, keine Doppelstimme, ungültige Ziele abgelehnt', () => {
    const t = toFinalVote();
    assert.deepEqual(t.cmd('p1', { t: 'castVote', targetId: 'p1' }), { ok: false, code: 'invalid_target' });
    assert.deepEqual(t.cmd('p1', { t: 'castVote', targetId: 'niemand' }), { ok: false, code: 'invalid_target' });
    assert.deepEqual(t.cmd('p1', { t: 'castVote', targetId: 'p2' }), { ok: true });
    assert.deepEqual(t.cmd('p1', { t: 'castVote', targetId: 'p3' }), { ok: false, code: 'already_done' });
  });

  it('Stimmen bleiben bis zur Auswertung geheim', () => {
    const t = toFinalVote(5);
    t.cmd('p1', { t: 'castVote', targetId: 'p2' });
    for (const id of t.ids) {
      const v = t.view(id);
      assert.deepEqual(v.match!.voted, ['p1']);
      if (id === 'p1') assert.equal(v.private!.myVote, 'p2');
      else {
        assert.equal(v.private!.myVote, null);
        assert.ok(!JSON.stringify(v).includes('"targetId"'));
      }
    }
  });

  it('vorzeitige Abstimmung: Mehrheit nötig, Unterstützung zurücknehmbar, Restzeit gesichert', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    t.giveClue();
    t.clock.advance(12_000); // 18 s Restzeit im laufenden Zug
    const active = t.active();
    assert.equal(t.cmd('p1', { t: 'proposeVote' }).ok, true);
    assert.equal(t.cmd('p2', { t: 'proposeVote' }).ok, true);
    assert.equal(t.cmd('p2', { t: 'withdrawSupport' }).ok, true);
    assert.deepEqual(t.view('p3').match!.proposal!.supporters, ['p1']);
    assert.equal(t.cmd('p2', { t: 'proposeVote' }).ok, true);
    assert.equal(t.view('p1').match!.phase, 'clues', '2 von 4 reichen nicht');
    assert.equal(t.cmd('p3', { t: 'proposeVote' }).ok, true);
    const m = t.view('p1').match!;
    assert.equal(m.phase, 'discussion');
    assert.equal(m.voteKind, 'early');
    t.advance(TIMINGS.discussionMs);
    // Keine Mehrheit: Stimmen verteilt
    t.cmd('p1', { t: 'castVote', targetId: 'p2' });
    t.cmd('p2', { t: 'castVote', targetId: 'p3' });
    t.cmd('p3', { t: 'castVote', targetId: 'p4' });
    t.advance(TIMINGS.votingMs);
    const back = t.view('p1').match!;
    assert.equal(back.phase, 'clues');
    assert.equal(back.activePlayerId, active, 'Partie geht am unterbrochenen Zug weiter');
    assert.equal(back.deadline! - t.clock.t, 18_000);
    assert.equal(back.proposalsLocked, true);
    assert.equal(back.lastEarlyVote!.abstentions, 1);
    assert.deepEqual(t.cmd('p4', { t: 'proposeVote' }), { ok: false, code: 'wrong_phase' });
  });

  it('Vorschläge verfallen am Ende des Durchgangs; einmal pro Durchgang vorschlagen', () => {
    const t = setupTable(5);
    startMatch(t);
    ackAll(t);
    assert.equal(t.cmd('p1', { t: 'proposeVote' }).ok, true);
    t.cmd('p1', { t: 'withdrawSupport' });
    assert.deepEqual(t.cmd('p1', { t: 'proposeVote' }), { ok: false, code: 'already_done' });
    t.cmd('p2', { t: 'proposeVote' });
    for (let i = 0; i < 5; i++) t.giveClue();
    const m = t.view('p1').match!;
    assert.equal(m.round, 2);
    assert.equal(m.proposal, null);
    assert.equal(t.cmd('p1', { t: 'proposeVote' }).ok, true);
  });

  it('Mehrheit bei vorzeitiger Abstimmung beendet die Partie sofort', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    for (const id of ['p1', 'p2', 'p3']) t.cmd(id, { t: 'proposeVote' });
    for (const id of t.ids) t.cmd(id, { t: 'readyToVote' });
    const imp = t.impostor();
    for (const id of t.ids) if (id !== imp) t.cmd(id, { t: 'castVote', targetId: imp });
    t.advance(TIMINGS.votingMs);
    assert.equal(t.view('p1').lastResult!.reason, 'impostor_caught');
  });
});

describe('Verbindungsabbrüche', () => {
  it('pausiert neutral, sichert Restzeit und setzt nach Rückkehr fort', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    t.clock.advance(10_000);
    t.lobby.setConnected('p3', false);
    let m = t.view('p1').match!;
    assert.deepEqual(m.paused!.playerIds, ['p3']);
    assert.equal(m.deadline, null);
    assert.equal(m.pausedRemainingMs, 20_000);
    const active = t.active();
    assert.equal(t.cmd(active!, { t: 'submitClue', text: 'x' }).ok, false);
    t.advance(30_000);
    t.lobby.setConnected('p3', true);
    m = t.view('p1').match!;
    assert.equal(m.paused, null);
    assert.equal(m.deadline! - t.clock.t, 20_000);
    // Reconnect erhält dieselbe Rolle
    assert.ok(t.view('p3').private);
  });

  it('bricht nach 60 s ohne Rückkehr ohne Wertung ab', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    t.lobby.setConnected('p2', false);
    t.advance(TIMINGS.reconnectGraceMs);
    const r = t.view('p1').lastResult!;
    assert.equal(r.outcome, 'aborted');
    assert.equal(r.abortReason, 'disconnect_timeout');
    assert.equal(r.abortPlayerId, 'p2');
    assert.ok(t.view('p1').lobby.players.every((p) => p.score === 0));
  });

  it('maximal 120 s Unterbrechung pro Person und Partie', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    for (let i = 0; i < 2; i++) {
      t.lobby.setConnected('p2', false);
      t.advance(50_000);
      t.lobby.setConnected('p2', true);
    }
    assert.ok(t.lobby.hasRunningMatch);
    t.lobby.setConnected('p2', false);
    t.advance(19_999);
    assert.ok(t.lobby.hasRunningMatch);
    t.advance(1);
    assert.equal(t.view('p1').lastResult!.abortReason, 'disconnect_timeout');
  });

  it('absichtliches Verlassen bricht ohne Wertung ab; Host wird neu bestimmt', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    t.lobby.leave('p1');
    const v = t.view('p2');
    assert.equal(v.lastResult!.abortReason, 'player_left');
    assert.equal(v.lobby.hostId, 'p2');
    assert.equal(v.lobby.phase, 'lobby');
  });

  it('neue Gäste während einer Partie erhalten keine Partiedaten', () => {
    const t = setupTable(4);
    startMatch(t);
    ackAll(t);
    t.giveClue('Stadion');
    t.lobby.join('late', { name: 'Spät', avatar: 1 });
    const v = t.lobby.viewFor('late')!;
    assert.equal(v.spectating, true);
    assert.equal(v.match, null);
    assert.equal(v.private, null);
    assert.ok(!JSON.stringify(v).includes('Stadion'));
    assert.equal(t.cmd('late', { t: 'castVote', targetId: 'p1' }).ok, false);
  });
});

describe('Mehrere Partien', () => {
  it('Wörter wiederholen sich innerhalb einer Lobby nicht, solange der Pool reicht', () => {
    const t = setupTable(4, { categories: ['tiere'] });
    const seen = new Set<string>();
    const poolSize = WORDS.filter((w) => w.category === 'tiere').length;
    for (let i = 0; i < poolSize; i++) {
      startMatch(t);
      ackAll(t);
      const word = t.view(t.insiders()[0]).private!.word!;
      assert.ok(!seen.has(word), `Wiederholung: ${word}`);
      seen.add(word);
      t.cmd(t.impostor(), { t: 'guessWord', text: 'nein' });
    }
    // Pool erschöpft → neu gemischt, weiterhin spielbar
    startMatch(t);
    assert.ok(t.lobby.hasRunningMatch);
  });
});
