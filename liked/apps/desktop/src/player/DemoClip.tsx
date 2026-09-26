import { useEffect, useRef } from 'react';
import { demoClipLook } from '@liked/tiktok-connectors';
import type { ClipPlayerProps } from './types';
import { t } from '../i18n/de';

/**
 * Eigene, stabile Testmedien für Demo-Partien: lokal gerenderter Hochkant-Clip
 * (Canvas + Web-Audio-Melodie). Kein TikTok-Verkehr, klar als DEMO markiert.
 */
export function DemoClip({ clip, loadKey, startAtLocal, stopAtLocal, startMuted, onReady, onPlayback }: ClipPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const look = demoClipLook(clip.videoId);
  const cb = useRef({ onReady, onPlayback });
  cb.current = { onReady, onPlayback };

  useEffect(() => {
    const h = window.setTimeout(() => cb.current.onReady(), 250);
    return () => window.clearTimeout(h);
  }, [clip.videoId, loadKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d')!;
    let raf = 0;
    let audio: AudioContext | null = null;
    let startedAt: number | null = null;
    let stopped = false;
    const dur = look.durationSec * 1000;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const now = Date.now();
      const elapsed = startedAt ? now - startedAt : 0;
      const p = Math.min(1, elapsed / dur);
      const g = ctx2d.createLinearGradient(0, 0, w, h);
      const hue = look.hue + Math.sin(elapsed / 900) * 20;
      g.addColorStop(0, `hsl(${hue} 70% 22%)`);
      g.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 12%)`);
      ctx2d.fillStyle = g;
      ctx2d.fillRect(0, 0, w, h);
      // bewegte Kreise
      for (let i = 0; i < 6; i++) {
        const a = elapsed / (1400 + i * 300) + i;
        ctx2d.beginPath();
        ctx2d.fillStyle = `hsla(${(hue + i * 25) % 360} 90% 60% / 0.18)`;
        ctx2d.arc(w / 2 + Math.cos(a) * w * 0.3, h / 2 + Math.sin(a * 1.3) * h * 0.3, w * (0.12 + 0.04 * i), 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.textAlign = 'center';
      ctx2d.font = `${Math.round(w * 0.28)}px "Segoe UI Emoji", sans-serif`;
      const bounce = startedAt && !stopped ? Math.abs(Math.sin(elapsed / 300)) * h * 0.03 : 0;
      ctx2d.fillText(look.emoji, w / 2, h * 0.47 - bounce);
      ctx2d.fillStyle = '#fff';
      ctx2d.font = `700 ${Math.round(w * 0.065)}px "Inter Variable", sans-serif`;
      ctx2d.fillText(look.title, w / 2, h * 0.62);
      ctx2d.fillStyle = 'rgba(245,158,11,0.95)';
      ctx2d.font = `800 ${Math.round(w * 0.05)}px "Inter Variable", sans-serif`;
      ctx2d.fillText(t.common.demo, w / 2, h * 0.08);
      // Fortschrittsbalken
      ctx2d.fillStyle = 'rgba(255,255,255,0.2)';
      ctx2d.fillRect(w * 0.06, h * 0.95, w * 0.88, 4);
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(w * 0.06, h * 0.95, w * 0.88 * p, 4);
      if (!document.hidden) raf = requestAnimationFrame(draw);
      else raf = window.setTimeout(() => (raf = requestAnimationFrame(draw)), 250) as unknown as number;
    };
    raf = requestAnimationFrame(draw);

    const startTimer =
      startAtLocal !== null
        ? window.setTimeout(() => {
            startedAt = Date.now();
            cb.current.onPlayback('started', 0);
            if (!startMuted) {
              audio = new AudioContext();
              const notes = [0, 4, 7, 12, 7, 4, 2, 5, 9, 12, 9, 5];
              const t0 = audio.currentTime + 0.05;
              const len = Math.min(look.durationSec, 30);
              for (let i = 0; i < len * 3; i++) {
                const o = audio.createOscillator();
                const gn = audio.createGain();
                o.type = 'triangle';
                o.frequency.value = look.baseFreq * 2 ** (notes[i % notes.length]! / 12);
                const at = t0 + i / 3;
                gn.gain.setValueAtTime(0.0001, at);
                gn.gain.exponentialRampToValueAtTime(0.06, at + 0.02);
                gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
                o.connect(gn).connect(audio.destination);
                o.start(at);
                o.stop(at + 0.32);
              }
            }
          }, Math.max(0, startAtLocal - Date.now()))
        : null;
    const stopTimer =
      stopAtLocal !== null
        ? window.setTimeout(() => {
            stopped = true;
            void audio?.close();
            audio = null;
          }, Math.max(0, Math.min(stopAtLocal, (startAtLocal ?? Date.now()) + dur) - Date.now()))
        : null;

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(raf);
      if (startTimer) window.clearTimeout(startTimer);
      if (stopTimer) window.clearTimeout(stopTimer);
      void audio?.close();
    };
  }, [clip.videoId, loadKey, startAtLocal, stopAtLocal, startMuted]);

  return <canvas ref={canvasRef} className="clip-canvas" width={540} height={960} aria-label={`Demo-Clip: ${look.title}`} />;
}
