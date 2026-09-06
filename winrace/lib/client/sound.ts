"use client";

/**
 * Winzige, synthetisierte Soundeffekte über die Web Audio API – bewusst
 * ohne externe Audiodatei (kein Asset-/Netzwerk-Bedarf, funktioniert offline
 * in OBS-Browserquellen).
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

function tone(freq: number, startAt: number, duration: number, gainValue = 0.15) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, audioCtx.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(gainValue, audioCtx.currentTime + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startAt + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + startAt);
  osc.stop(audioCtx.currentTime + startAt + duration + 0.05);
}

export function playChime() {
  tone(523.25, 0, 0.18); // C5
  tone(659.25, 0.12, 0.22); // E5
  tone(783.99, 0.24, 0.35); // G5
}

export function playPing() {
  tone(880, 0, 0.15, 0.1);
}
