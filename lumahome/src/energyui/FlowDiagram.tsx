// Energiefluss (Momentanleistung) zwischen Netz, PV, Speicher und Haus.
import { formatPower } from "@/energy/units";
import type { FlowValues } from "@/energy/aggregate";

export function FlowDiagram({ f, house, houseLabel }: { f: FlowValues; house: number | null; houseLabel: string }) {
  const W = 300;
  const H = 240;
  const node = (x: number, y: number, label: string, value: string, color: string, sub?: string) => (
    <g transform={`translate(${x},${y})`}>
      <circle r={30} fill="#FFFFFF" stroke={color} strokeWidth={3} />
      <text textAnchor="middle" y={-4} className="fill-ink text-[11px] font-semibold">
        {label}
      </text>
      <text textAnchor="middle" y={11} className="fill-ink-2 text-[10px] tabular-nums">
        {value}
      </text>
      {sub && (
        <text textAnchor="middle" y={46} className="fill-ink-2 text-[10px]">
          {sub}
        </text>
      )}
    </g>
  );
  const line = (x1: number, y1: number, x2: number, y2: number, w: number | null, color: string) => {
    if (w === null) return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#DCDED6" strokeWidth={2} strokeDasharray="4 4" />;
    const width = w <= 5 ? 1.5 : Math.min(10, 2 + Math.log10(w) * 2);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={w <= 5 ? "#DCDED6" : color} strokeWidth={width} strokeLinecap="round" />;
  };
  const gridIn = f.gridImport;
  const gridOut = f.gridExport;
  const gridNet = gridIn !== null && gridOut !== null ? gridIn - gridOut : null;
  const bat = f.batteryDischarge !== null && f.batteryCharge !== null ? f.batteryDischarge - f.batteryCharge : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Energiefluss">
      {f.hasGrid && line(70, 105, 150, 105, gridNet === null ? null : Math.abs(gridNet), "#6F7773")}
      {f.hasPv && line(150, 40, 150, 105, f.pv, "#C98A1B")}
      {f.hasBattery && line(150, 170, 150, 105, bat === null ? null : Math.abs(bat), "#4D7163")}
      {f.hasGrid &&
        node(45, 105, "Netz", gridNet === null ? "kein Wert" : formatPower(Math.abs(gridNet)), "#6F7773", gridNet === null ? undefined : gridNet >= 0 ? "Bezug" : "Einspeisung")}
      {f.hasPv && node(150, 30, "PV", f.pv === null ? "kein Wert" : formatPower(f.pv), "#C98A1B")}
      {f.hasBattery && node(150, 175, "Speicher", bat === null ? "kein Wert" : formatPower(Math.abs(bat)), "#4D7163", bat === null ? undefined : bat > 5 ? "entlädt" : bat < -5 ? "lädt" : "Ruhe")}
      {node(f.hasGrid || f.hasPv || f.hasBattery ? 225 : 150, 105, "Haus", house === null ? "kein Wert" : formatPower(house), "#7866B2", houseLabel)}
      {(f.hasGrid || f.hasPv || f.hasBattery) && line(150, 105, 195, 105, house, "#7866B2")}
    </svg>
  );
}
