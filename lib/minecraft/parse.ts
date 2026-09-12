/** Parst die Ausgabe des vanilla "list"-Befehls, z. B.
 * "There are 2 of a max of 20 players online: Alice, Bob" */
export function parseListCommand(output: string): { online: number; max: number; names: string[] } {
  const match = output.match(/(\d+) of a max(?: of)? (\d+) players online:?\s*(.*)/i);
  if (!match) return { online: 0, max: 0, names: [] };
  const [, online, max, rest] = match;
  const names = rest
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return { online: Number(online), max: Number(max), names };
}
