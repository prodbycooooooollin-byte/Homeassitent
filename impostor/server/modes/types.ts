import type {
  ClientCommand,
  ErrorCode,
  LobbySettings,
  MatchPublic,
  MatchResult,
  ModeId,
  PlayerId,
  PrivateView,
} from '../../shared/protocol.ts';

/**
 * Schnittstelle für Spielmodi. Die Lobby verwaltet Personen, Host, Einstellungen,
 * Chat, Bereitschaft und Punktestand; ein Modus verwaltet genau eine Partie.
 *
 * Weitere Modi („Impostor zeichnet", „Andere Frage", „Impostor erzählt",
 * „Zwei Wörter") implementieren dieselbe Schnittstelle mit eigenen Regeln und
 * eigenen Sichten. Es gibt bewusst keine universelle Spiel-Engine.
 */
export interface MatchContext {
  now(): number;
  randomInt(maxExclusive: number): number;
  newId(): string;
  /** Wird genau einmal aufgerufen, wenn die Partie endet (Sieg oder Abbruch). */
  finish(result: MatchResult): void;
}

export type CommandResult = { ok: true } | { ok: false; code: ErrorCode };

export interface MatchController {
  readonly id: string;
  readonly mode: ModeId;
  readonly participants: readonly PlayerId[];
  isOver(): boolean;
  handle(playerId: PlayerId, cmd: ClientCommand): CommandResult;
  /** Verarbeitet abgelaufene Fristen. */
  tick(): void;
  /** Nächster Zeitpunkt, zu dem `tick` etwas zu tun hat. */
  nextWakeAt(): number | null;
  setConnected(playerId: PlayerId, connected: boolean): void;
  /** Person verlässt die Partie absichtlich. */
  leave(playerId: PlayerId): void;
  abort(reason: 'server_restart'): void;
  publicView(forPlayer: PlayerId): MatchPublic;
  privateView(forPlayer: PlayerId): PrivateView;
}

export interface MatchSetup {
  participants: PlayerId[];
  settings: LobbySettings;
  usedWordIds: Set<string>;
}
