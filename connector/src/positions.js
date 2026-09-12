import { runRconCommands } from "./rcon.js";

const POS_RE = /\[([-\d.]+)d?,\s*([-\d.]+)d?,\s*([-\d.]+)d?\]/;
const DIM_RE = /"(minecraft:[a-z_]+)"/;

const DIMENSION_MAP = {
  "minecraft:overworld": "OVERWORLD",
  "minecraft:the_nether": "NETHER",
  "minecraft:the_end": "END",
};

/**
 * Fragt für jeden übergebenen Spielernamen Position und Dimension per RCON
 * ab (`/data get entity <name> Pos|Dimension`). Erfordert RCON UND dass der
 * Spieler online ist (der Befehl schlägt sonst fehl) - liefert für nicht
 * abfragbare Spieler einfach kein Ergebnis, statt einen Fehler zu werfen.
 */
export async function fetchPositions(rconConfig, usernames) {
  if (!rconConfig || usernames.length === 0) return new Map();

  const commands = usernames.flatMap((name) => [
    `data get entity ${name} Pos`,
    `data get entity ${name} Dimension`,
  ]);

  let responses;
  try {
    responses = await runRconCommands(rconConfig.host, rconConfig.port, rconConfig.password, commands);
  } catch (err) {
    console.error(`[craftboard] RCON-Positionsabfrage fehlgeschlagen: ${err.message}`);
    return new Map();
  }

  const positions = new Map();
  for (let i = 0; i < usernames.length; i++) {
    const posResponse = responses[i * 2];
    const dimResponse = responses[i * 2 + 1];
    const posMatch = posResponse?.match(POS_RE);
    const dimMatch = dimResponse?.match(DIM_RE);
    if (!posMatch) continue;
    const dimension = dimMatch ? DIMENSION_MAP[dimMatch[1]] : undefined;
    if (!dimension) continue;
    positions.set(usernames[i], {
      x: parseFloat(posMatch[1]),
      y: parseFloat(posMatch[2]),
      z: parseFloat(posMatch[3]),
      dimension,
    });
  }
  return positions;
}

export async function fetchOnlineList(rconConfig) {
  if (!rconConfig) return null;
  try {
    const [response] = await runRconCommands(rconConfig.host, rconConfig.port, rconConfig.password, ["list"]);
    const match = response.match(/(\d+) of a max(?: of)? (\d+) players online:?\s*(.*)/i);
    if (!match) return null;
    const names = match[3]
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    return { max: Number(match[2]), names };
  } catch (err) {
    console.error(`[craftboard] RCON "list" fehlgeschlagen: ${err.message}`);
    return null;
  }
}
