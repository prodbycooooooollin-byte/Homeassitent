import { settingsStore } from '../state/storage.ts';

/**
 * Eigene, zur Laufzeit synthetisierte Klänge (Web Audio) – keine Fremd-Assets,
 * keine Lizenzfragen. Öffentliche Klänge sind für alle Rollen identisch.
 */
export type Sfx =
  | 'hover'
  | 'click'
  | 'join'
  | 'ready'
  | 'unready'
  | 'shuffle'
  | 'deal'
  | 'flip'
  | 'turn'
  | 'myTurn'
  | 'clue'
  | 'tick'
  | 'tickUrgent'
  | 'propose'
  | 'phase'
  | 'vote'
  | 'drumroll'
  | 'win'
  | 'lose'
  | 'reveal'
  | 'error'
  | 'chat'
  | 'collect';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicOn = false;

  constructor() {
    settingsStore.subscribe(() => this.applyVolumes());
  }

  /** Muss nach einer Nutzerinteraktion aufgerufen werden (Autoplay-Regeln). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(comp);
      this.musicGain.connect(comp);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.musicOn) this.startMusic();
  }

  private applyVolumes() {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return;
    const s = settingsStore.get();
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(s.muted ? 0 : s.sfxVolume * 0.9, t, 0.02);
    this.musicGain.gain.setTargetAtTime(s.muted ? 0 : s.musicVolume * 0.35, t, 0.3);
  }

  private tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    const peak = opts.gain ?? 0.3;
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.sfxGain!);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private hiss(start: number, dur: number, opts: { freq?: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 2000, start);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    f.Q.value = opts.q ?? 1.2;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  }

  play(name: Sfx) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const s = settingsStore.get();
    if (s.muted || s.sfxVolume <= 0) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'hover':
        this.hiss(t, 0.04, { freq: 5000, gain: 0.04, q: 2 });
        break;
      case 'click':
        this.tone(900, t, 0.05, { type: 'triangle', gain: 0.12, to: 600 });
        break;
      case 'join':
        this.hiss(t, 0.22, { freq: 1200, to: 3500, gain: 0.18 });
        this.tone(520, t + 0.16, 0.12, { type: 'triangle', gain: 0.12 });
        break;
      case 'ready':
        this.tone(660, t, 0.12, { type: 'triangle', gain: 0.2 });
        this.tone(990, t + 0.07, 0.2, { type: 'triangle', gain: 0.18 });
        this.hiss(t, 0.03, { freq: 3000, gain: 0.12 });
        break;
      case 'unready':
        this.tone(660, t, 0.1, { type: 'triangle', gain: 0.14, to: 440 });
        break;
      case 'shuffle':
        for (let i = 0; i < 9; i++) this.hiss(t + i * 0.055, 0.05, { freq: 2500 + Math.random() * 1500, gain: 0.14 });
        break;
      case 'deal':
        this.hiss(t, 0.12, { freq: 1800, to: 4200, gain: 0.16 });
        break;
      case 'flip':
        this.hiss(t, 0.06, { freq: 2600, gain: 0.2 });
        this.hiss(t + 0.12, 0.05, { freq: 1800, gain: 0.16 });
        break;
      case 'turn':
        this.tone(520, t, 0.16, { type: 'sine', gain: 0.12 });
        break;
      case 'myTurn':
        this.tone(784, t, 0.14, { type: 'triangle', gain: 0.18 });
        this.tone(1175, t + 0.1, 0.24, { type: 'triangle', gain: 0.16 });
        break;
      case 'clue':
        this.hiss(t, 0.16, { freq: 1500, to: 3800, gain: 0.16 });
        this.tone(180, t + 0.15, 0.09, { type: 'sine', gain: 0.35, to: 90 });
        this.hiss(t + 0.15, 0.03, { freq: 3500, gain: 0.14 });
        break;
      case 'tick':
        this.tone(1400, t, 0.03, { type: 'square', gain: 0.04 });
        break;
      case 'tickUrgent':
        this.tone(1800, t, 0.05, { type: 'square', gain: 0.07 });
        break;
      case 'propose':
        this.tone(440, t, 0.12, { type: 'triangle', gain: 0.16 });
        this.tone(554, t + 0.09, 0.16, { type: 'triangle', gain: 0.14 });
        break;
      case 'phase':
        this.tone(220, t, 0.8, { type: 'sine', gain: 0.18, attack: 0.08 });
        this.tone(330, t + 0.05, 0.7, { type: 'sine', gain: 0.12, attack: 0.08 });
        this.hiss(t, 0.6, { freq: 400, to: 1500, gain: 0.08, type: 'lowpass' });
        break;
      case 'vote':
        this.tone(150, t, 0.12, { type: 'sine', gain: 0.4, to: 70 });
        this.hiss(t, 0.05, { freq: 1200, gain: 0.12 });
        break;
      case 'drumroll':
        for (let i = 0; i < 22; i++) {
          this.hiss(t + i * 0.055, 0.05, { freq: 900, gain: 0.05 + (i / 22) * 0.2, q: 0.8 });
        }
        this.tone(110, t, 1.3, { type: 'sine', gain: 0.12, to: 220, attack: 0.4 });
        break;
      case 'reveal':
        this.hiss(t, 0.09, { freq: 2400, gain: 0.25 });
        this.tone(98, t, 0.5, { type: 'sine', gain: 0.4, to: 60 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.5, { type: 'triangle', gain: 0.16 }));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(f, t + i * 0.13, 0.5, { type: 'triangle', gain: 0.15 }));
        break;
      case 'error':
        this.tone(160, t, 0.14, { type: 'square', gain: 0.06 });
        break;
      case 'chat':
        this.tone(1200, t, 0.06, { type: 'sine', gain: 0.07 });
        break;
      case 'collect':
        for (let i = 0; i < 5; i++) this.hiss(t + i * 0.06, 0.08, { freq: 2000 - i * 200, gain: 0.12 });
        break;
    }
  }

  /** Zurückhaltende, generative Hintergrundmusik: weiche Akkordflächen. */
  private startMusic() {
    if (!this.ctx || !this.musicGain) return;
    this.musicOn = true;
    const ctx = this.ctx;
    const out = this.musicGain;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(out);
    const chords = [
      [220, 261.63, 329.63, 392],
      [174.61, 220, 261.63, 329.63],
      [196, 246.94, 293.66, 392],
      [164.81, 196, 246.94, 329.63],
    ];
    let i = 0;
    const barSec = 6;
    const playChord = () => {
      const t = ctx.currentTime + 0.05;
      for (const f of chords[i % chords.length]) {
        for (const detune of [-4, 4]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = f / 2;
          osc.detune.value = detune;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + barSec + 1.5);
          osc.connect(g).connect(filter);
          osc.start(t);
          osc.stop(t + barSec + 2);
        }
      }
      i += 1;
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, barSec * 1000);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicOn = false;
  }
}

export const sound = new SoundEngine();
export const play = (s: Sfx) => sound.play(s);
