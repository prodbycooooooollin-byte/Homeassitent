'use strict';
// Kleine prozedurale Soundeffekte per WebAudio (keine Audiodateien nötig)
const Audio2 = {
  ctx: null, on: true, last: {},
  init() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    try { this.on = localStorage.getItem('aethermoor_sound') !== '0'; } catch (e) { /* egal */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, d, type = 'sine', vol = 0.06, slide = 0, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, vol = 0.05, freq = 1200) {
    const c = this.ctx; if (!c) return;
    const n = c.sampleRate * d, buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = buf; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  },
  play(k) {
    if (!this.on || !this.ctx) return;
    const now = performance.now();
    if (this.last[k] && now - this.last[k] < 60) return; this.last[k] = now;
    switch (k) {
      case 'hit': this.noise(0.09, 0.07, 1800); this.tone(180, 0.08, 'square', 0.03, -80); break;
      case 'shoot': this.tone(700, 0.1, 'triangle', 0.04, -400); break;
      case 'cast': this.tone(500, 0.2, 'sine', 0.05, 500); break;
      case 'nova': this.noise(0.3, 0.08, 900); this.tone(220, 0.3, 'sawtooth', 0.04, -120); break;
      case 'boom': this.noise(0.45, 0.12, 500); this.tone(90, 0.4, 'sine', 0.1, -50); break;
      case 'blink': this.tone(900, 0.15, 'sine', 0.05, -600); break;
      case 'buff': this.tone(440, 0.15, 'sine', 0.05, 0); this.tone(660, 0.2, 'sine', 0.05, 0, 0.1); break;
      case 'heal': this.tone(520, 0.15, 'sine', 0.05); this.tone(780, 0.25, 'sine', 0.05, 0, 0.1); break;
      case 'hurt': this.noise(0.12, 0.06, 700); this.tone(120, 0.12, 'sawtooth', 0.04, -40); break;
      case 'kill': this.tone(300, 0.15, 'square', 0.04, -150); break;
      case 'loot': this.tone(880, 0.07, 'triangle', 0.05); this.tone(1320, 0.1, 'triangle', 0.05, 0, 0.06); break;
      case 'coin': this.tone(1200, 0.06, 'square', 0.03); this.tone(1600, 0.1, 'square', 0.03, 0, 0.05); break;
      case 'equip': this.noise(0.08, 0.05, 2500); break;
      case 'potion': this.tone(300, 0.2, 'sine', 0.05, 400); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.07, 0, i * 0.12)); break;
      case 'quest': this.tone(392, 0.15, 'triangle', 0.06); this.tone(523, 0.25, 'triangle', 0.06, 0, 0.12); break;
      case 'questdone': [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, 0, i * 0.1)); break;
      case 'learn': this.tone(600, 0.1, 'sine', 0.05); this.tone(900, 0.15, 'sine', 0.05, 0, 0.07); break;
      case 'death': this.tone(200, 1, 'sawtooth', 0.06, -150); break;
      case 'boss': this.tone(80, 0.8, 'sawtooth', 0.09, -30); this.noise(0.6, 0.06, 300); break;
      case 'bossdown': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.07, 0, i * 0.13)); break;
      case 'gather': this.noise(0.2, 0.05, 1500); this.tone(500, 0.15, 'sine', 0.04, 200); break;
      case 'craft': this.noise(0.1, 0.07, 3000); this.tone(700, 0.15, 'triangle', 0.05, 0, 0.1); break;
      case 'talk': this.tone(420, 0.08, 'triangle', 0.04); break;
      case 'fail': this.tone(160, 0.12, 'square', 0.04); break;
    }
  },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('aethermoor_sound', this.on ? '1' : '0'); } catch (e) { /* egal */ }
    return this.on;
  },
};
