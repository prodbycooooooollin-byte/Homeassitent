/** Vergrößert ein kleines Bild in Stufen (je höchstens 2×, hochwertige Interpolation) und schärft es leicht nach – wirkt deutlich klarer als das Aufziehen per CSS.
 *  Das Ergebnis ist eine Blob-Adresse (nur im Browser nutzbar) in Zielgröße; gleiche Anfragen werden zwischengespeichert. */
const cache = new Map<string, Promise<string>>();

export function sharpUpscale(src: string, targetW: number, targetH: number, sharpen = 0.5): Promise<string> {
  const key = `${src}|${Math.round(targetW)}x${Math.round(targetH)}|${sharpen}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const blob = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(blob);
    let cw = bmp.width, ch = bmp.height;
    const tw = Math.min(4096, Math.round(targetW)), th = Math.min(4096, Math.round(targetH));
    if (cw >= tw && ch >= th) return URL.createObjectURL(blob); // schon groß genug
    let cur: CanvasImageSource = bmp;
    // Seitenverhältnis des Ziels beibehalten: nach „cover“-Skalierung auf Zielgröße
    const scale = Math.max(tw / cw, th / ch);
    const fw = Math.round(cw * scale), fh = Math.round(ch * scale);
    while (cw < fw || ch < fh) {
      const nw = Math.min(fw, Math.round(cw * 2)), nh = Math.min(fh, Math.round(ch * 2));
      const c = document.createElement("canvas"); c.width = nw; c.height = nh;
      const x = c.getContext("2d")!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.drawImage(cur, 0, 0, nw, nh);
      cur = c; cw = nw; ch = nh;
    }
    const out = cur as HTMLCanvasElement;
    if (sharpen > 0) unsharp(out, sharpen);
    return await new Promise<string>((resolve, reject) => out.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("toBlob"))), "image/png"));
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/** Unscharf-Maskieren mit 3×3-Weichzeichner (Alpha bleibt unverändert). */
function unsharp(c: HTMLCanvasElement, amount: number) {
  const x = c.getContext("2d")!;
  const w = c.width, h = c.height;
  if (w * h > 16_000_000) return;
  const img = x.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d);
  for (let yy = 1; yy < h - 1; yy++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const i = (yy * w + xx) * 4;
      for (let k = 0; k < 3; k++) {
        const blur = (src[i + k - 4] + src[i + k + 4] + src[i + k - w * 4] + src[i + k + w * 4] + src[i + k] * 4) / 8;
        d[i + k] = src[i + k] + (src[i + k] - blur) * amount * 2;
      }
    }
  }
  x.putImageData(img, 0, 0);
}
