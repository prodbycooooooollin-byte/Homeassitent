/**
 * Client-seitige Sicht auf `getRoomState()` (lib/server/room-state.ts),
 * nachdem sie einmal durch JSON serialisiert wurde – alle `Date`-Werte sind
 * daher ISO-Strings statt `Date`-Instanzen. Server Components serialisieren
 * ihren initialen State bewusst genauso (siehe `serializeState` je Seite),
 * damit derselbe Typ für den Erstzustand und jeden Reconnect-Refetch über
 * `/api/rooms/[code]/state` gilt.
 */

export type TeamSide = "A" | "B";

export interface RoomMemberView {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "HOST" | "TEAM_LEAD" | "MEMBER" | "SPECTATOR";
  isTeamLead: boolean;
  status: "PENDING" | "ACTIVE" | "REMOVED" | "BANNED";
  twitchLogin: string | null;
  joinedAt: string;
}

export interface TeamView {
  id: string;
  side: TeamSide;
  name: string;
  color: string;
  locked: boolean;
  currentGameId: string | null;
  memberCount: number;
  members: RoomMemberView[];
}

export interface GameProgressView {
  id: string;
  value: number;
  status: "PENDING" | "ACTIVE" | "COMPLETED";
  startedAt: string | null;
  completedAt: string | null;
  lastUpdatedById: string | null;
  lastUpdatedAt: string | null;
}

export interface GameView {
  id: string;
  order: number;
  name: string;
  coverUrl: string | null;
  progressType: "WINS" | "POINTS" | "TASK";
  targetValue: number;
  timeLimitMinutes: number | null;
  rulesText: string | null;
  appliesTo: "BOTH" | "TEAM_A" | "TEAM_B";
  difficulty: number | null;
  bonusPoints: number | null;
  requireEvidence: boolean;
  requiresPreviousCompleted: boolean;
  progress: Record<string, GameProgressView>;
}

export interface ChallengeView {
  id: string;
  status: "LOBBY" | "READY" | "RUNNING" | "PAUSED" | "FINISHED" | "ARCHIVED";
  startedAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  winnerTeamId: string | null;
  winnerConfirmedAt: string | null;
  pendingWinnerTeamId: string | null;
  pendingWinnerAt: string | null;
  elapsedMs: number;
  remainingMs: number | null;
  games: GameView[];
}

export interface RoomView {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  maxMembersPerTeam: number;
  startAt: string | null;
  timeLimitMinutes: number | null;
  allowMemberProgress: boolean;
  onlyTeamLeadEdits: boolean;
  requireHostConfirmation: boolean;
  requireJoinApproval: boolean;
  teamsLocked: boolean;
  isDemo: boolean;
  isArchived: boolean;
  hostId: string;
  hostName: string;
}

export interface RoomStateView {
  canSeeFullDetails: boolean;
  room: RoomView;
  teams: TeamView[];
  challenge: ChallengeView | null;
  viewer: {
    userId: string | null;
    member: { id: string; role: string; status: string; isTeamLead: boolean; teamId: string | null } | null;
    permissions: {
      canManageRoom: boolean;
      canManageMembers: boolean;
      canManageOverlay: boolean;
      canConfirmWinner: boolean;
      canSelfAssignTeam: boolean;
      canUpdateTeamA: boolean;
      canUpdateTeamB: boolean;
    };
  };
}

/**
 * Wandelt ein Server-Objekt (mit echten `Date`-Instanzen) in reines JSON um
 * – exakt die Form, die auch `/api/rooms/[code]/state` liefert. Der
 * Rückgabetyp ist bewusst `unknown`: an jeder Aufrufstelle wird explizit
 * auf den passenden `*View`-Typ gecastet, damit der Date→String-Wechsel
 * sichtbar bleibt statt (falsch) den Eingabetyp beizubehalten.
 */
export interface TeamStatsView {
  teamId: string;
  side: TeamSide;
  name: string;
  color: string;
  overallPercent: number;
  completedGames: number;
  totalApplicableGames: number;
  totalWins: number;
  remainingWins: number;
  currentStreak: number;
  averageTimePerGameMs: number | null;
  fastestGame: { gameId: string; name: string; durationMs: number } | null;
  lastWinAt: string | null;
  mostActiveMember: { userId: string; displayName: string; actionCount: number } | null;
  etaMs: number | null;
  timeline: { gameId: string; gameName: string; completedAt: string }[];
}

export interface RoomStatsView {
  teams: TeamStatsView[];
  leadingTeamId: string | null;
  leadMarginPercent: number | null;
}

export function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
