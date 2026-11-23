import { getAll, getById, hrefFor } from "@/lib/content/repository";
import type { EntityKind, MapPoint, VerificationStatus } from "@/lib/content/schema";

export interface MapPin {
  id: string;
  title: string;
  kind: EntityKind;
  status: VerificationStatus;
  summary: string;
  href: string;
  x: number;
  y: number;
  precision: MapPoint["precision"];
  region?: string;
  art?: { scene: string; seed: number };
  src?: string;
}

export function getMapPins(kinds?: EntityKind[]): MapPin[] {
  return getAll()
    .filter((e) => e.mapPoint && (!kinds || kinds.includes(e.kind)))
    .map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.verification.status,
      summary: e.summary,
      href: hrefFor(e),
      x: e.mapPoint!.x,
      y: e.mapPoint!.y,
      precision: e.mapPoint!.precision,
      region: e.locationId ? getById(e.locationId)?.title : undefined,
      art: e.media[0].art,
      src: e.media[0].src,
    }));
}
