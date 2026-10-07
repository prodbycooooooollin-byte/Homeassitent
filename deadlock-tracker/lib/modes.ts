/** ECitadelMatchMode / ECitadelGameMode aus den Valve-Protobufs (SteamDatabase/Protobufs). */
const MATCH_MODES: Record<number, string> = {
  1: "Unranked", 2: "Privat", 3: "Coop-Bots", 4: "Ranked", 5: "Servertest", 6: "Tutorial", 7: "Hero Labs", 8: "Platzierung",
};
const GAME_MODES: Record<number, string> = { 2: "1v1-Test", 3: "Sandbox", 4: "Street Brawl", 5: "NYC erkunden", 6: "Intern" };

export function modeLabel(matchMode: unknown, gameMode: unknown): string | undefined {
  if (typeof gameMode === "number" && GAME_MODES[gameMode]) return GAME_MODES[gameMode];
  if (typeof matchMode === "number") return MATCH_MODES[matchMode];
  if (typeof matchMode === "string" && matchMode) return matchMode.replace(/^k_ECitadelMatchMode_/, "");
  return undefined;
}
