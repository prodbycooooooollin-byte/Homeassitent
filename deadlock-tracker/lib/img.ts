/** Bild über den lokalen Cache-Proxy ausliefern (läuft auch in Client-Code). */
export const imgUrl = (u?: string) => (u ? `/api/img?u=${encodeURIComponent(u)}` : undefined);

/** Direkter Endpunkt für Rang-Badges (Tier 1-11, Division 1-6) mit eingezeichneter Division. */
export const rankImageUrl = (tier: number, sub: number, format: "png" | "webp" = "png") =>
  imgUrl(`https://api.deadlock-api.com/v1/assets/ranks/${tier}/${sub}/image?format=${format}`);
