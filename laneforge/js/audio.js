import { getSettings } from "./storage.js";
let ctx = null, noiseBuf = null;
function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return null; }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
function tone(freq, dur, type = "sine", vol = 0.2, slide = 0) {
  const c = ac(); if (!c) return;
  const v = vol * getSettings().volume; if (v <= 0.001) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(v, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
function noise(dur, vol = 0.2, freq = 1800) {
  const c = ac(); if (!c) return;
  const v = vol * getSettings().volume; if (v <= 0.001) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(v, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(); s.stop(c.currentTime + dur);
}
export const sfx = {
  unlock() { ac(); },
  shot(heavy = 0, vol = 1) { noise(0.07 + heavy * 0.08, 0.16 * vol, 1500 - heavy * 700); tone(160 - heavy * 60, 0.08, "square", 0.05 * vol, -60); },
  hit(crit) { tone(crit ? 1500 : 900, 0.07, "triangle", crit ? 0.2 : 0.12, crit ? 400 : 0); },
  kill() { tone(520, 0.1, "triangle", 0.18); setTimeout(() => tone(780, 0.14, "triangle", 0.18), 70); },
  hurt() { tone(110, 0.14, "sawtooth", 0.14, -40); },
  reload() { noise(0.05, 0.1, 3000); setTimeout(() => noise(0.06, 0.12, 2200), 120); },
  dash() { noise(0.18, 0.12, 700); },
  ability() { tone(300, 0.25, "sawtooth", 0.14, 500); },
  boom() { noise(0.4, 0.28, 300); tone(80, 0.35, "sine", 0.2, -50); },
  soul() { tone(1100, 0.08, "sine", 0.12, 300); },
  check() { tone(660, 0.09, "triangle", 0.18); setTimeout(() => tone(990, 0.12, "triangle", 0.18), 80); },
  tick() { tone(440, 0.05, "square", 0.08); },
  go() { tone(880, 0.25, "triangle", 0.2); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.2), i * 110)); },
  lose() { [400, 330, 260].forEach((f, i) => setTimeout(() => tone(f, 0.25, "sawtooth", 0.14), i * 140)); },
  click() { tone(700, 0.04, "square", 0.06); },
};
