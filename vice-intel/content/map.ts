/**
 * Map image for the Intel Map.
 *
 * By default VICE INTEL draws its own simplified illustration of Leonida.
 * To use a real map image, put it in /public/map (only an image you have the
 * rights to use — e.g. your own stitched captures, or a map whose licence
 * allows it) and fill in `mapImage`. Then open /map?calibrate=1, click places
 * on the image to read their coordinates, and update `mapPoint` on records.
 *
 * Coordinates: the image is fitted (letterboxed) into a 1000 × 1000 square;
 * x/y of every pin refer to that square.
 *
 * Example:
 *   export const mapImage: MapImage = {
 *     src: "/map/leonida.webp",
 *     width: 4096, height: 4096,
 *     attribution: { label: "Map: …", license: "…", url: "…" },
 *     background: "#0b1a2a",
 *   };
 */
export interface MapImage {
  src: string;
  width: number;
  height: number;
  attribution: { label: string; license: string; url?: string };
  /** colour behind the image (sea) */
  background?: string;
}

export const mapImage: MapImage | null = null;
