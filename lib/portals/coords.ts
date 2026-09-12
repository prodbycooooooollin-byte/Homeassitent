/**
 * Berechnet das theoretische Gegenstück eines Portals nach der bekannten
 * Minecraft-Faustregel (Nether-Koordinaten = Oberwelt / 8, Y unverändert).
 * Das tatsächliche Spiel sucht beim Betreten einen Bereich um dieses Ziel
 * und kann ein neues Portal an leicht abweichender Stelle erzeugen - dies
 * ist daher ein BERECHNETER Schätzwert, keine bestätigte Verbindung.
 */
export function computeCounterpart(
  dimension: "OVERWORLD" | "NETHER",
  x: number,
  z: number,
): { dimension: "OVERWORLD" | "NETHER"; x: number; z: number } {
  if (dimension === "OVERWORLD") {
    return { dimension: "NETHER", x: x / 8, z: z / 8 };
  }
  return { dimension: "OVERWORLD", x: x * 8, z: z * 8 };
}
