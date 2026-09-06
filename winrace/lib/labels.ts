/**
 * Zentrale deutsche UI-Texte für Enum-Werte. Bewusst hier gebündelt statt in
 * einzelnen Komponenten verstreut – nicht nur zur Wiederverwendung
 * (Dashboard, Overlays und Live-Ansicht zeigen dieselben Zustände), sondern
 * auch als Ansatzpunkt für spätere weitere Sprachen: eine zweite Datei
 * gleicher Struktur (z.B. `labels.en.ts`) reicht aus, um umzuschalten.
 */

export const ROOM_ROLE_LABELS: Record<string, string> = {
  HOST: "Host",
  TEAM_LEAD: "Team-Lead",
  MEMBER: "Mitglied",
  SPECTATOR: "Zuschauer",
};

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Wartet auf Bestätigung",
  ACTIVE: "Aktiv",
  REMOVED: "Entfernt",
  BANNED: "Gesperrt",
};

export const CHALLENGE_STATUS_LABELS: Record<string, string> = {
  LOBBY: "Lobby",
  READY: "Bereit",
  RUNNING: "Läuft",
  PAUSED: "Pausiert",
  FINISHED: "Beendet",
  ARCHIVED: "Archiviert",
};

export const CHALLENGE_STATUS_COLORS: Record<string, string> = {
  LOBBY: "bg-ink-faint/20 text-ink-muted",
  READY: "bg-info/15 text-info",
  RUNNING: "bg-success/15 text-success",
  PAUSED: "bg-warning/15 text-warning",
  FINISHED: "bg-brand/20 text-brand",
  ARCHIVED: "bg-ink-faint/20 text-ink-faint",
};

export const GAME_STATUS_LABELS: Record<string, string> = {
  PENDING: "Wartend",
  ACTIVE: "Aktiv",
  COMPLETED: "Abgeschlossen",
};

export const PROGRESS_TYPE_LABELS: Record<string, string> = {
  WINS: "Siege",
  POINTS: "Punkte",
  TASK: "Aufgabe",
};

export const PROGRESS_TYPE_UNIT: Record<string, string> = {
  WINS: "Sieg(e)",
  POINTS: "Punkt(e)",
  TASK: "Erledigt",
};

export const APPLIES_TO_LABELS: Record<string, string> = {
  BOTH: "Beide Teams",
  TEAM_A: "Nur Team A",
  TEAM_B: "Nur Team B",
};

export const OVERLAY_TYPE_LABELS: Record<string, string> = {
  TEAM_COMPARISON: "Gesamtvergleich",
  TEAM_A: "Nur Team A",
  TEAM_B: "Nur Team B",
  COMPACT: "Kompakte Leiste",
  CURRENT_GAME: "Aktuelles Spiel",
  FULL_LIST: "Vollständige Liste",
  WINNER: "Gewinner & Event",
};

export const OVERLAY_TYPE_DESCRIPTIONS: Record<string, string> = {
  TEAM_COMPARISON: "Beide Teams nebeneinander, ideal für einen Fullscreen-Break.",
  TEAM_A: "Nur der Fortschritt von Team A – für den Stream dieses Teams.",
  TEAM_B: "Nur der Fortschritt von Team B – für den Stream dieses Teams.",
  COMPACT: "Schmaler Balken für den Rand des Streams, minimal ablenkend.",
  CURRENT_GAME: "Großformatige Anzeige des aktuellen Spiels beider Teams.",
  FULL_LIST: "Die komplette Spieleliste mit Fortschritt beider Teams.",
  WINNER: "Erscheint automatisch, sobald ein Sieger feststeht.",
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  WIN_ADDED: "Neuer Sieg",
  GAME_COMPLETED: "Spiel abgeschlossen",
  WINNER_PENDING: "Vorläufiger Sieger",
  CHALLENGE_ENDED: "Challenge beendet",
  CHALLENGE_PAUSED: "Challenge pausiert",
  CHALLENGE_RESUMED: "Challenge fortgesetzt",
  JOIN_REQUESTED: "Neue Beitrittsanfrage",
  JOIN_APPROVED: "Beitritt bestätigt",
};
