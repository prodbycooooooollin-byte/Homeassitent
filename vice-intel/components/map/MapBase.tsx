import { mapImage } from "@/content/map";
import { KEYS, LAKE, LAND_PATH, ROADS } from "@/lib/map/leonida";

export const HAS_MAP_IMAGE = Boolean(mapImage);

export function mapDisclaimer(): string {
  return mapImage
    ? `Map: ${mapImage.attribution.label}. Pin positions are approximate.`
    : "Schematic illustration — not the in-game map. Pin positions are approximate.";
}

/** Map background in the 1000×1000 coordinate space: a configured map image, or the built-in schematic. */
export function MapBase({ zoom = 1, id = "mb" }: { zoom?: number; id?: string }) {
  if (mapImage) {
    return (
      <>
        <rect x="-500" y="-500" width="2000" height="2000" fill={mapImage.background ?? "#0a1424"} />
        <image href={mapImage.src} x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" />
      </>
    );
  }
  return (
    <>
      <defs>
        <pattern id={`${id}-grid`} width="25" height="25" patternUnits="userSpaceOnUse">
          <path d="M25 0H0V25" fill="none" stroke="#fff" strokeOpacity=".035" />
        </pattern>
      </defs>
      <rect x="-500" y="-500" width="2000" height="2000" fill="#0a1424" />
      <rect x="-500" y="-500" width="2000" height="2000" fill={`url(#${id}-grid)`} />
      <path d={LAND_PATH} fill="#173326" stroke="#3d6b55" strokeWidth="2.5" />
      <path d={LAND_PATH} fill="none" stroke="#3d6b55" strokeOpacity=".25" strokeWidth="14" />
      <ellipse {...LAKE} fill="#0f2338" stroke="#23466b" />
      {KEYS.map((k, i) => (
        <ellipse key={i} cx={k.cx} cy={k.cy} rx={k.rx} ry={k.ry} transform={`rotate(${k.rot} ${k.cx} ${k.cy})`} fill="#173326" stroke="#3d6b55" strokeWidth="2" />
      ))}
      {ROADS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#c9b8e8" strokeOpacity=".3" strokeWidth={2.5 / Math.sqrt(zoom)} strokeDasharray={i === 2 ? "6 6" : undefined} />
      ))}
    </>
  );
}
