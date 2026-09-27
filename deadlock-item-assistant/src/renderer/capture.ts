// Unsichtbares Aufnahmefenster: hält EINEN gedrosselten Bildschirm-Stream offen (1–2 Bilder/s) und
// kopiert auf Anfrage nur die benötigten HUD-Bereiche aus dem jeweils neuesten Bild.
// Ein Dauer-Stream ist deutlich schonender für das Spiel als wiederholte Einzel-Screenshots.
import { captureRegions } from '../vision/regions';

interface Cap {
  onStart(cb: (o: { sourceId: string; width: number; height: number; fps: number }) => void): void;
  onStop(cb: () => void): void;
  onGrab(cb: (o: { id: number }) => void): void;
  reply(o: unknown): void;
}
const cap = (window as unknown as { cap: Cap }).cap;

let stream: MediaStream | null = null;
let latest: VideoFrame | null = null;
let reading = false;
let error = '';

async function start(o: { sourceId: string; width: number; height: number; fps: number }) {
  stop();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop', chromeMediaSourceId: o.sourceId,
          minWidth: o.width, maxWidth: o.width, minHeight: o.height, maxHeight: o.height, maxFrameRate: o.fps,
        },
      } as unknown as MediaTrackConstraints,
    });
    const track = stream.getVideoTracks()[0]!;
    const Proc = (window as unknown as { MediaStreamTrackProcessor: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
    const reader = new Proc({ track }).readable.getReader();
    reading = true;
    error = '';
    // Immer nur das neueste Bild behalten; ältere sofort freigeben
    void (async () => {
      while (reading) {
        const r = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (r.done || !r.value) break;
        latest?.close();
        latest = r.value;
      }
    })();
  } catch (e) {
    error = `Aufnahme nicht möglich: ${(e as Error).message}`;
  }
}

function stop() {
  reading = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  latest?.close();
  latest = null;
}

cap.onStart((o) => void start(o));
cap.onStop(() => stop());
cap.onGrab(({ id }) => {
  const f = latest;
  if (!f) { cap.reply({ id, error: error || 'noch kein Bild' }); return; }
  const W = f.displayWidth, H = f.displayHeight;
  const out = captureRegions(W, H).map((q) => {
    const c = new OffscreenCanvas(q.w, q.h);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(f, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
    return { ...q, data: ctx.getImageData(0, 0, q.w, q.h).data };
  });
  cap.reply({ id, width: W, height: H, regions: out });
});
