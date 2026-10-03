import { useEffect, useRef } from 'react';

/**
 * Spielhintergrund: weiche Farbflächen und schwebende Lichtpunkte (Canvas). Überlagert nie das Video, pausiert bei
 * verstecktem Fenster und entfällt bei reduzierter Bewegung oder niedriger Qualität.
 */
export function Background({ mood, enabled }: { mood: 'menu' | 'lobby' | 'round' | 'reveal' | 'finale'; enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const parts = Array.from({ length: 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.00012,
      vy: -0.00004 - Math.random() * 0.00012,
      hue: [270, 330, 188][Math.floor(Math.random() * 3)]!,
      a: 0.18 + Math.random() * 0.4
    }));
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      const m = moodRef.current;
      const speed = m === 'round' ? 0.3 : m === 'reveal' ? 1.2 : 0.7;
      for (const p of parts) {
        p.x += p.vx * dt * speed;
        p.y += p.vy * dt * speed;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        if (p.x < -0.02) p.x = 1.02;
        if (p.x > 1.02) p.x = -0.02;
        const hue = m === 'finale' && p.hue === 188 ? 45 : p.hue;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue} 90% 65% / ${m === 'round' ? p.a * 0.4 : p.a})`;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  return (
    <div className={`bg bg-${mood} ${enabled ? 'animated' : ''}`} aria-hidden="true">
      <div className="bg-aurora">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      {enabled && <canvas ref={ref} className="bg-canvas" />}
      <div className="bg-vignette" />
    </div>
  );
}
