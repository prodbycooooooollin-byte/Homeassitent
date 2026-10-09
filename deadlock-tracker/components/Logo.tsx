export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-[0_0_12px_rgba(240,180,76,.35)]">
      <defs>
        <linearGradient id="lg-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a8" /><stop offset=".5" stopColor="#f0b44c" /><stop offset="1" stopColor="#b8741a" />
        </linearGradient>
        <linearGradient id="lg-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2335" /><stop offset="1" stopColor="#090b11" />
        </linearGradient>
        <radialGradient id="lg-glow" cx=".5" cy=".42" r=".6"><stop offset="0" stopColor="#f0b44c" stopOpacity=".3" /><stop offset="1" stopColor="#f0b44c" stopOpacity="0" /></radialGradient>
      </defs>
      <path d="M32 3 55 16.5v31L32 61 9 47.5v-31Z" fill="url(#lg-b)" stroke="url(#lg-g)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 3 55 16.5v31L32 61 9 47.5v-31Z" fill="url(#lg-glow)" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="url(#lg-g)" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="20.2 4.4" transform="rotate(-86 32 32)" />
      <g stroke="url(#lg-g)" strokeWidth="2.6" strokeLinecap="round"><path d="M32 10.5v5M32 53.5v-5M10.5 32h5M53.5 32h-5" /></g>
      <circle cx="32" cy="29.6" r="4.6" fill="url(#lg-g)" />
      <path d="M29.6 31.5h4.8l2 10.3H27.6Z" fill="url(#lg-g)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.14em]">
        <span className="text-gold-grad">Lockscope</span>
        <span className="block text-[10px] font-medium tracking-[0.42em] text-muted">Match-Analyse</span>
      </span>
    </span>
  );
}
