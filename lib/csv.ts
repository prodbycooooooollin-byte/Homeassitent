import type { EnergyPoint } from "./types";

export function downloadEnergyCsv(points: EnergyPoint[], filename: string): void {
  const header = "Zeitpunkt,Wert,Vorperiode";
  const rows = points.map((p) => `${p.time},${p.value},${p.previous ?? ""}`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
