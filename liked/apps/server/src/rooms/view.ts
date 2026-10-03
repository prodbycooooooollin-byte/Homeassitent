import type { RoomView, RoundView, ScoreEntry } from '@liked/protocol';
import type { Room } from './room.js';

/**
 * Baut die personalisierte Sicht eines Spielers. Es werden ausschließlich Felder
 * übernommen, die dieser Spieler in dieser Phase kennen darf – interne Modelle
 * werden nie direkt serialisiert.
 *
 * Geheimhaltung vor der Auflösung:
 *  - Kein Besitzer, keine Lösung, keine fremden Stimmen.
 *  - Nur der Besitzer selbst erfährt `role: 'owner'`.
 *  - Stimmen nur als anonyme Anzahl.
 */
export function buildView(room: Room, youId: string): RoomView {
  const you = room.players.get(youId);
  const m = room.match;
  const inRound = room.phase === 'PREPARING' || room.phase === 'COUNTDOWN' || room.phase === 'PLAYING_AND_VOTING';
  let round: RoundView | null = null;
  if (inRound && m?.current && room.runtime && you && !you.waiting && room.matchPlayers.includes(youId)) {
    const r = m.current;
    const isOwner = r.ownerId === youId;
    const own = r.votes.get(youId);
    const scheduled = room.phase !== 'PREPARING';
    round = {
      roundId: r.roundId,
      clip: r.clip,
      startAt: scheduled ? r.startAt : 0,
      deadline: scheduled ? r.deadline : 0,
      answerSeconds: room.settings.answerSeconds,
      answerOptions: isOwner ? [] : room.matchPlayers.filter((id) => id !== youId),
      you: {
        role: isOwner ? 'owner' : 'voter',
        vote: own ? { targetId: own.targetId, voteId: own.voteId, confirmed: true } : null
      },
      votesIn: r.votes.size,
      votersTotal: r.eligible.length,
      loadAttempt: room.runtime.loadAttempt
    };
  }

  const scores: ScoreEntry[] = m ? m.standings() : room.results?.standings ?? [];
  const showReveal = room.phase === 'REVEAL' || room.phase === 'SCOREBOARD';

  return {
    roomId: room.id,
    code: room.code,
    version: room.version,
    mode: room.mode,
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    paused: room.paused,
    settings: { ...room.settings },
    youId,
    hostId: room.hostId,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      ready: p.ready,
      connected: p.connected,
      mediaChecked: p.mediaChecked,
      poolStatus: p.poolStatus,
      waiting: p.waiting
    })),
    scores: room.phase === 'LOBBY' ? [] : scores,
    roundNumber: m ? m.roundNumber : 0,
    totalRounds: m ? m.totalRounds : 0,
    blockIndex: m ? Math.max(0, m.blockIndex) : 0,
    totalBlocks: m ? m.totalBlocks : 0,
    round,
    reveal: showReveal && room.reveal ? structuredClone(room.reveal) : null,
    results: room.phase === 'RESULTS' && room.results ? structuredClone(room.results) : null,
    notices: [...room.notices],
    startBlockers: room.phase === 'LOBBY' ? room.startBlockers() : []
  };
}
