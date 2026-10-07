/** Bild über den lokalen Cache-Proxy ausliefern (läuft auch in Client-Code). */
export const imgUrl = (u?: string) => (u ? `/api/img?u=${encodeURIComponent(u)}` : undefined);
