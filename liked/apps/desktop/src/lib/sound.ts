/**
 * Sounddesign vollständig per Web Audio erzeugt (selbst erstellt, keine Fremdlizenzen).
 * Getrennte Busse für Musik und Effekte; das TikTok-Videoaudio läuft im Player und
 * wird hier nicht gesteuert. Ereignisse mit Schlüssel werden genau einmal abgespielt.
 */
type Wave = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private duckGain!: GainNode;
  private played = new Set<string>();
  private playedOrder: string[] = [];
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteAt = 0;
  private settings = { music: 0.5, sfx: 0.7, musicMuted: false, sfxMuted: false };
  private musicWanted = false;
  private ducked = false;
  private lastHover = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.duckGain).connect(this.master);
    this.sfxBus.connect(this.master);
    this.applyVolumes();
    return ctx;
  }

  /** Nach einer Nutzerinteraktion aufrufen (Autoplay-Richtlinie). */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume();
    if (this.musicWanted) this.startMusic();
  }

  configure(s: { music: number; sfx: number; musicMuted: boolean; sfxMuted: boolean }): void {
    this.settings = { ...s };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.musicMuted ? 0 : this.settings.music * 0.35, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxMuted ? 0 : this.settings.sfx, t, 0.02);
  }

  /** Musik absenken, solange ein Clip läuft. */
  duck(on: boolean): void {
    this.ducked = on;
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, on ? 0.15 : 0.6);
  }

  once(key: string, fn: () => void): void {
    if (this.played.has(key)) return;
    this.played.add(key);
    this.playedOrder.push(key);
    if (this.playedOrder.length > 400) this.played.delete(this.playedOrder.shift()!);
    fn();
  }

  /* ---------------- Grundbausteine ---------------- */

  private tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; at?: number; attack?: number; slideTo?: number; bus?: 'sfx' | 'music'; filter?: number } = {}): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = (opts.at ?? ctx.currentTime) + 0.005;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 0.2;
    const attack = opts.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(opts.bus === 'music' ? this.musicBus : this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private noise(dur: number, opts: { gain?: number; from?: number; to?: number; at?: number } = {}): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = (opts.at ?? ctx.currentTime) + 0.005;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(opts.from ?? 400, t0);
    f.frequency.exponentialRampToValueAtTime(opts.to ?? 3000, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  private chord(freqs: number[], dur: number, gain: number, type: Wave = 'triangle', spread = 0): void {
    const now = this.ctx?.currentTime ?? 0;
    freqs.forEach((f, i) => this.tone(f, dur, { type, gain, at: now + i * spread }));
  }

  /* ---------------- Effekte ---------------- */

  hover(): void {
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    this.tone(1800, 0.04, { type: 'sine', gain: 0.018 });
  }
  click(): void {
    this.tone(880, 0.06, { type: 'triangle', gain: 0.09, slideTo: 660 });
  }
  join(): void {
    this.chord([523, 784], 0.25, 0.07, 'triangle', 0.07);
  }
  leave(): void {
    this.chord([659, 440], 0.25, 0.06, 'triangle', 0.08);
  }
  ready(): void {
    this.chord([587, 880], 0.18, 0.08, 'square', 0.05);
  }
  countdown(step: number): void {
    // 3 → 2 → 1: steigend; 0 = Start
    if (step <= 0) {
      this.chord([523, 659, 784, 1047], 0.5, 0.08, 'sawtooth');
      this.noise(0.25, { gain: 0.05, from: 2000, to: 8000 });
      return;
    }
    const f = { 3: 440, 2: 523, 1: 659 }[step] ?? 440;
    this.tone(f, 0.18, { type: 'square', gain: 0.07, filter: 2400 });
  }
  voteSent(): void {
    // Neutral – verrät nichts über die Korrektheit.
    this.tone(1320, 0.08, { type: 'sine', gain: 0.08 });
    this.tone(1760, 0.1, { type: 'sine', gain: 0.05, at: (this.ctx?.currentTime ?? 0) + 0.06 });
  }
  suspense(): void {
    this.noise(1.1, { gain: 0.06, from: 200, to: 1800 });
    this.tone(110, 1.1, { type: 'sawtooth', gain: 0.04, slideTo: 220, filter: 900 });
  }
  reveal(): void {
    this.noise(0.35, { gain: 0.09, from: 5000, to: 600 });
    this.chord([392, 494, 587], 0.7, 0.06, 'triangle', 0.02);
  }
  correct(): void {
    this.chord([523, 659, 784, 1047], 0.35, 0.07, 'triangle', 0.06);
  }
  wrong(): void {
    this.tone(196, 0.35, { type: 'sawtooth', gain: 0.05, slideTo: 147, filter: 700 });
  }
  streak(level: number): void {
    const base = 523 * 2 ** (Math.min(level, 6) / 12);
    this.chord([base, base * 1.26, base * 1.5, base * 2], 0.25, 0.06, 'square', 0.04);
  }
  points(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (let i = 0; i < 5; i++) this.tone(1200 + i * 120, 0.05, { type: 'sine', gain: 0.04, at: now + i * 0.04 });
  }
  finale(): void {
    const now = this.ctx?.currentTime ?? 0;
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 1.2 : 0.18, { type: 'triangle', gain: 0.08, at: now + i * 0.12 }));
    this.chord([262, 330, 392], 1.6, 0.05, 'sawtooth');
  }
  error(): void {
    // Bewusst leise.
    this.tone(330, 0.12, { type: 'sine', gain: 0.04 });
  }

  /* ---------------- Menümusik (generativ) ---------------- */

  startMusic(): void {
    this.musicWanted = true;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || this.musicTimer !== null) return;
    this.nextNoteAt = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 200);
  }

  stopMusic(): void {
    this.musicWanted = false;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.ducked || document.hidden) {
      if (ctx) this.nextNoteAt = Math.max(this.nextNoteAt, ctx.currentTime + 0.1);
      return;
    }
    // Am-F-C-G, ruhige Achtel, weiche Pads.
    const chords = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [196, 261.6, 329.6],
      [196, 246.9, 293.7]
    ];
    const stepDur = 0.42;
    while (this.nextNoteAt < ctx.currentTime + 0.6) {
      const bar = Math.floor(this.musicStep / 8) % chords.length;
      const c = chords[bar]!;
      const pos = this.musicStep % 8;
      if (pos === 0) {
        for (const f of c) this.tone(f, stepDur * 8, { type: 'sawtooth', gain: 0.035, at: this.nextNoteAt, attack: 0.8, bus: 'music', filter: 900 });
        this.tone(c[0]! / 2, stepDur * 8, { type: 'sine', gain: 0.08, at: this.nextNoteAt, attack: 0.3, bus: 'music' });
      }
      const arp = [c[0]! * 2, c[1]! * 2, c[2]! * 2, c[1]! * 2];
      if (pos % 2 === 0) this.tone(arp[(pos / 2) % 4]!, 0.3, { type: 'triangle', gain: 0.03, at: this.nextNoteAt, bus: 'music', filter: 3000 });
      this.nextNoteAt += stepDur;
      this.musicStep++;
    }
  }

  /** Testton für den Medientest in der Lobby. */
  testTone(): void {
    this.chord([440, 554, 659], 0.8, 0.08, 'triangle', 0.12);
  }
}

export const sound = new SoundEngine();
