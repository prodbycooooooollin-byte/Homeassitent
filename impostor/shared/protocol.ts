/**
 * Gemeinsames Protokoll zwischen Client und Server.
 *
 * Begriffe (verbindlich in UI und Code):
 *  - Zug (turn):       eine Person gibt einen Hinweis ab
 *  - Durchgang (round): alle Personen waren einmal an der Reihe
 *  - Partie (match):   von der geheimen Rollenverteilung bis zum Sieg eines Teams
 *  - Lobby (lobby):    die Gruppe bleibt über mehrere Partien zusammen
 *
 * Der Server schickt jedem Client ausschließlich eine *persönliche* Sicht
 * (`ClientView`). Geheimnisse (Rollenzuordnung, Wort, Aliase, Stimmen)
 * verlassen den Server erst mit der Auflösung.
 */

export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  minPlayers: 3,
  maxPlayers: 10,
  nameMax: 16,
  clueMax: 40,
  guessMax: 40,
  chatMax: 200,
  lobbyCodeLength: 5,
  /** max. JSON-Nachrichtengröße vom Client in Bytes */
  maxMessageBytes: 4096,
} as const;

export const TIMINGS = {
  roleRevealMs: 60_000,
  discussionMs: 45_000,
  votingMs: 30_000,
  /** Pause pro Verbindungsabbruch */
  reconnectGraceMs: 60_000,
  /** Gesamtbudget Unterbrechung pro Person und Partie */
  disconnectBudgetMs: 120_000,
  /** Lobby-Mitglieder außerhalb einer Partie werden nach dieser Zeit entfernt */
  lobbyIdleRemoveMs: 60_000,
} as const;

export const ROUND_OPTIONS = [3, 5, 8, 10, 12] as const;
export const TURN_SECONDS_OPTIONS = [15, 30, 45, 60, 0] as const; // 0 = ohne Zugtimer
export const AVATAR_COUNT = 12;

/** Zeichen ohne leicht verwechselbare Zeichen (kein 0/O, 1/I/L, 2/Z, 5/S, 8/B). */
export const LOBBY_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

export type PlayerId = string;
export type ModeId = 'classic';

export type CategoryId =
  | 'alltag'
  | 'essen'
  | 'sport'
  | 'tiere'
  | 'orte'
  | 'berufe'
  | 'gaming'
  | 'film';

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  icon: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'alltag', label: 'Alltag', icon: '☕' },
  { id: 'essen', label: 'Essen & Trinken', icon: '🍕' },
  { id: 'sport', label: 'Sport', icon: '⚽' },
  { id: 'tiere', label: 'Tiere', icon: '🦊' },
  { id: 'orte', label: 'Orte', icon: '🗺️' },
  { id: 'berufe', label: 'Berufe', icon: '🧑‍🔧' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'film', label: 'Filme & Serien', icon: '🎬' },
];

export interface LobbySettings {
  mode: ModeId;
  categories: CategoryId[];
  /** Abstimmung spätestens nach N Durchgängen */
  maxRounds: (typeof ROUND_OPTIONS)[number];
  /** Sekunden pro Zug, 0 = ohne Zugtimer */
  turnSeconds: (typeof TURN_SECONDS_OPTIONS)[number];
  /** Gemeinsamer Kategoriehinweis für alle (inkl. Impostor) */
  categoryHint: boolean;
  /** Lobby-Punktestand anzeigen */
  scoreboard: boolean;
}

export const DEFAULT_SETTINGS: LobbySettings = {
  mode: 'classic',
  categories: CATEGORIES.map((c) => c.id),
  maxRounds: 10,
  turnSeconds: 30,
  categoryHint: false,
  scoreboard: true,
};

export type MatchPhase =
  | 'roleReveal'
  | 'clues'
  | 'discussion'
  | 'voting'
  | 'resolution'
  | 'aborted';

/** Phase aus Sicht der Lobby: `lobby` = keine laufende Partie. */
export type LobbyPhase = 'lobby' | MatchPhase;

export type Role = 'insider' | 'impostor';

export type WinReason =
  | 'guess_correct' // Impostor hat das Wort erraten
  | 'guess_wrong' // Impostor hat falsch geraten
  | 'impostor_caught' // Mehrheit auf dem Impostor
  | 'wrong_accusation' // Mehrheit auf einer unschuldigen Person
  | 'no_majority'; // Schlussabstimmung ohne absolute Mehrheit

export type AbortReason =
  | 'role_timeout' // nicht alle haben ihre Rolle bestätigt
  | 'player_left' // jemand hat die Partie verlassen
  | 'disconnect_timeout' // jemand kam nicht rechtzeitig zurück
  | 'server_restart';

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  avatar: number;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  /** Seit wann in der Lobby (für Host-Nachfolge) */
  joinedAt: number;
  /** Nimmt an der laufenden Partie teil */
  inMatch: boolean;
  score: number;
}

export interface ClueCard {
  id: string;
  playerId: PlayerId;
  round: number; // 1-basiert
  /** null = „Kein Hinweis abgegeben" */
  text: string | null;
}

export interface ChatMessage {
  id: string;
  playerId: PlayerId;
  text: string;
  at: number;
  /** 'lobby' oder Partie-ID */
  channel: string;
}

export interface EarlyVoteOutcome {
  round: number;
  /** Stimmen pro Person (ohne Wählerzuordnung) */
  counts: { playerId: PlayerId; votes: number }[];
  abstentions: number;
}

/** Öffentliche Sicht auf eine laufende Partie (für Teilnehmer). */
export interface MatchPublic {
  id: string;
  mode: ModeId;
  phase: MatchPhase;
  seatOrder: PlayerId[];
  round: number;
  maxRounds: number;
  activePlayerId: PlayerId | null;
  /** Serverzeit (ms), zu der die aktuelle Phase / der Zug endet. null = kein Timer oder pausiert */
  deadline: number | null;
  /** Gesamtdauer der aktuellen Frist (für Fortschrittsanzeigen) */
  deadlineTotalMs: number | null;
  /** Bei Pause: gesicherte Restzeit */
  pausedRemainingMs: number | null;
  turnSeconds: number;
  clues: ClueCard[];
  /** Rollenbestätigung (nur wer, nicht was) */
  acknowledged: PlayerId[];
  /** Abstimmungsvorschlag im aktuellen Durchgang */
  proposal: { supporters: PlayerId[]; needed: number } | null;
  /** Personen, die in diesem Durchgang bereits einen Vorschlag gestartet haben */
  proposedThisRound: PlayerId[];
  /** In diesem Durchgang gab es bereits eine vorzeitige Abstimmung */
  proposalsLocked: boolean;
  voteKind: 'early' | 'final' | null;
  /** Wer bereits abgestimmt hat – nie für wen */
  voted: PlayerId[];
  readyToVote: PlayerId[];
  votesNeeded: number;
  lastEarlyVote: EarlyVoteOutcome | null;
  /** Nur wenn der Host den gemeinsamen Kategoriehinweis aktiviert hat */
  categoryHint: string | null;
  paused: { playerIds: PlayerId[]; abortAt: number } | null;
}

export interface PrivateView {
  role: Role;
  /** Nur für Eingeweihte */
  word: string | null;
  canGuess: boolean;
  guessUsed: boolean;
  /** Eigene, noch geheime Stimme */
  myVote: PlayerId | null;
}

export interface MatchResult {
  matchId: string;
  endedAt: number;
  outcome: 'win' | 'aborted';
  winner: Role | null;
  reason: WinReason | null;
  abortReason: AbortReason | null;
  /** Betroffene Person beim Abbruch (z. B. Verbindungsabbruch) */
  abortPlayerId: PlayerId | null;
  impostorId: PlayerId | null;
  word: string | null;
  category: CategoryId | null;
  guess: string | null;
  /** Bei Abstimmung: wer hat wen gewählt (null = Enthaltung) */
  votes: { voterId: PlayerId; targetId: PlayerId | null }[] | null;
  accusedId: PlayerId | null;
  clues: ClueCard[];
  seatOrder: PlayerId[];
  winners: PlayerId[];
}

export interface ClientView {
  rev: number;
  serverNow: number;
  me: { id: PlayerId; name: string; avatar: number };
  lobby: {
    code: string;
    phase: LobbyPhase;
    hostId: PlayerId;
    settings: LobbySettings;
    players: PlayerPublic[];
    chat: ChatMessage[];
    maxPlayers: number;
  };
  /** Nur für Teilnehmer der laufenden Partie */
  match: MatchPublic | null;
  /** Nur für Teilnehmer der laufenden Partie */
  private: PrivateView | null;
  /** Ich bin Zuschauer einer laufenden Partie */
  spectating: boolean;
  lastResult: MatchResult | null;
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

export interface Profile {
  name: string;
  avatar: number;
}

export type ClientCommand =
  | { t: 'createLobby' }
  | { t: 'joinLobby'; code: string }
  | { t: 'leaveLobby' }
  | { t: 'setProfile'; profile: Profile }
  | { t: 'setReady'; ready: boolean }
  | { t: 'updateSettings'; settings: Partial<LobbySettings> }
  | { t: 'kick'; playerId: PlayerId }
  | { t: 'startMatch' }
  | { t: 'ackRole' }
  | { t: 'submitClue'; text: string }
  | { t: 'proposeVote' }
  | { t: 'withdrawSupport' }
  | { t: 'readyToVote' }
  | { t: 'castVote'; targetId: PlayerId }
  | { t: 'guessWord'; text: string }
  | { t: 'chat'; text: string };

export type ClientMessage =
  | { type: 'hello'; token: string | null; profile: Profile; protocol: number }
  | { type: 'ping'; clientTime: number }
  | { type: 'cmd'; actionId: string; cmd: ClientCommand };

export type ErrorCode =
  | 'bad_request'
  | 'not_found' // Lobby-Code nicht gefunden
  | 'lobby_full'
  | 'kicked'
  | 'not_allowed'
  | 'wrong_phase'
  | 'not_your_turn'
  | 'empty'
  | 'duplicate'
  | 'too_long'
  | 'rate_limited'
  | 'not_enough_players'
  | 'not_all_ready'
  | 'already_done'
  | 'invalid_target'
  | 'paused'
  | 'no_lobby';

export type ServerMessage =
  | {
      type: 'welcome';
      token: string;
      playerId: PlayerId;
      serverNow: number;
      /** Token war unbekannt (z. B. nach Serverneustart) */
      sessionReset: boolean;
      webClient: boolean;
    }
  | { type: 'pong'; clientTime: number; serverNow: number }
  | { type: 'state'; view: ClientView | null }
  | { type: 'ack'; actionId: string; ok: true }
  | { type: 'ack'; actionId: string; ok: false; code: ErrorCode; message: string }
  | { type: 'notice'; kind: 'kicked' | 'replaced' | 'server_shutdown' | 'lobby_closed'; message: string };

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  bad_request: 'Ungültige Anfrage.',
  not_found: 'Code nicht gefunden.',
  lobby_full: 'Lobby voll.',
  kicked: 'Du wurdest aus dieser Lobby entfernt.',
  not_allowed: 'Dafür fehlen dir die Rechte.',
  wrong_phase: 'Das geht in dieser Phase nicht.',
  not_your_turn: 'Du bist gerade nicht an der Reihe.',
  empty: 'Bitte gib einen Hinweis ein.',
  duplicate: 'Dieser Hinweis wurde schon gegeben.',
  too_long: 'Zu lang.',
  rate_limited: 'Nicht so schnell – kurz warten.',
  not_enough_players: 'Mindestens drei verbundene Personen nötig.',
  not_all_ready: 'Noch nicht alle sind bereit.',
  already_done: 'Das hast du bereits getan.',
  invalid_target: 'Ungültige Auswahl.',
  paused: 'Die Partie ist pausiert.',
  no_lobby: 'Du bist in keiner Lobby.',
};

export function votesNeeded(participants: number): number {
  return Math.floor(participants / 2) + 1;
}

export function isValidLobbyCode(code: string): boolean {
  if (code.length !== LIMITS.lobbyCodeLength) return false;
  for (const ch of code) if (!LOBBY_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Normalisiert Nutzereingaben für die Codeeingabe. */
export function normalizeLobbyCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.lobbyCodeLength);
}

/** Entfernt Steuerzeichen, normalisiert Unicode und Leerraum. */
export function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
