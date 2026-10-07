import { averageBadge } from "../ranks";
import { modeLabel } from "../modes";
import type { HistoryEntry, MatchDetails, MatchPlayer, TeamId } from "../types";

/* Alle Parser sind absichtlich tolerant: fehlende/umbenannte Felder führen zu 0/null statt zu Abstürzen. */

type Obj = Record<string, unknown>;
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const team = (v: unknown): TeamId => {
  if (v === 1 || v === "1" || v === "Team1" || v === "k_ECitadelLobbyTeam_Team1") return 1;
  return 0;
};

/** Teams heißen in der API teils 0/1, teils 2/3 (Hidden King/Archmother als enum). */
function teamFromRaw(v: unknown): TeamId {
  if (typeof v === "number") return v === 1 || v === 3 ? 1 : 0;
  if (typeof v === "string") {
    if (/archmother|team1/i.test(v)) return 1;
    if (/hidden|team0/i.test(v)) return 0;
  }
  return team(v);
}

export function normalizeHistory(raw: unknown, accountId: number): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const matchId = num(r.match_id);
    if (!matchId) continue;
    const t = teamFromRaw(r.player_team);
    // player_match_outcome: 1 = Sieg, 2 = Niederlage, 3/4 = bestraft (zählt als Niederlage), sonst Fallback auf match_result (= Siegerteam)
    const outcome = num(r.player_match_outcome);
    const won = outcome === 1 ? true : outcome >= 2 && outcome <= 4 ? false : r.match_result !== undefined && r.match_result !== null && teamFromRaw(r.match_result) === t;
    const badge = num(r.ranked_display_badge);
    out.push({
      matchId,
      accountId: num(r.account_id, accountId) || accountId,
      heroId: num(r.hero_id),
      startTime: num(r.start_time),
      durationS: num(r.match_duration_s),
      won,
      team: t,
      kills: num(r.player_kills),
      deaths: num(r.player_deaths),
      assists: num(r.player_assists),
      netWorth: num(r.net_worth),
      lastHits: num(r.last_hits),
      denies: num(r.denies),
      heroLevel: num(r.hero_level),
      abandoned: num(r.abandoned_time_s) > 0,
      matchMode: modeLabel(r.match_mode, r.game_mode),
      gameMode: typeof r.game_mode === "number" ? String(r.game_mode) : undefined,
      badge: badge > 0 ? badge : null,
      rankedDelta: typeof r.ranked_delta === "number" ? r.ranked_delta : null,
    });
  }
  return out;
}

/** Letzter Eintrag der Zeitreihe `stats` enthält die Endwerte. */
function finalStats(p: Obj): Obj {
  const s = p.stats;
  if (Array.isArray(s) && s.length && isObj(s[s.length - 1])) return s[s.length - 1] as Obj;
  return {};
}

export function normalizeMetadata(raw: unknown): MatchDetails | null {
  if (!isObj(raw)) return null;
  const info = (isObj(raw.match_info) ? raw.match_info : raw) as Obj;
  const matchId = num(info.match_id);
  if (!matchId || !Array.isArray(info.players) || info.players.length === 0) return null;

  const players: MatchPlayer[] = [];
  for (const p of info.players) {
    if (!isObj(p)) continue;
    const st = finalStats(p);
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (typeof st[k] === "number") return st[k] as number;
        if (typeof p[k] === "number") return p[k] as number;
      }
      return 0;
    };
    // Rang des Spielers zu Spielbeginn: player_rank_data.initial_display_rank (tier*10+subrank)
    const rd = isObj(p.player_rank_data) ? p.player_rank_data : {};
    const badgeRaw = num(rd.initial_display_rank ?? p.rank ?? p.ranked_badge_level ?? p.badge_level, 0);
    players.push({
      accountId: num(p.account_id),
      team: teamFromRaw(p.team ?? p.assigned_lane_team),
      heroId: num(p.hero_id),
      kills: pick("kills"),
      deaths: pick("deaths"),
      assists: pick("assists"),
      level: num(p.level),
      netWorth: pick("net_worth"),
      lastHits: pick("last_hits"),
      denies: pick("denies"),
      heroDamage: pick("player_damage", "hero_damage"),
      objectiveDamage: pick("boss_damage", "objective_damage"),
      healing: pick("player_healing", "healing") + pick("self_healing"),
      damageTaken: pick("damage_taken", "player_damage_taken"),
      badge: badgeRaw > 0 ? badgeRaw : null,
      abandoned: num(p.abandon_match_time_s) > 0,
    });
  }

  const wt = info.winning_team;
  // match_outcome: 0 = Teamsieg, 1 = Fehler, 2 = Unentschieden
  const outcomeOk = info.match_outcome === undefined || info.match_outcome === 0 || info.match_outcome === "k_eOutcome_TeamWin";
  const winningTeam: TeamId | null = !outcomeOk || wt === undefined || wt === null ? null : teamFromRaw(wt);
  const teamBadge = (t: TeamId, key: string): number | null => {
    const v = num(info[key]);
    if (v > 0) return v;
    return averageBadge(players.filter((p) => p.team === t).map((p) => p.badge));
  };

  return {
    matchId,
    startTime: num(info.start_time),
    durationS: num(info.duration_s),
    winningTeam,
    matchMode: modeLabel(info.match_mode, info.game_mode),
    gameMode: typeof info.game_mode === "number" ? String(info.game_mode) : undefined,
    avgBadge: [teamBadge(0, "average_badge_team0"), teamBadge(1, "average_badge_team1")],
    players,
  };
}
