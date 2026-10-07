export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-[0_0_12px_rgba(240,180,76,.35)]">
      <defs>
        <linearGradient id="lg-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe29a" /><stop offset=".5" stopColor="#f0b44c" /><stop offset="1" stopColor="#b8741a" />
        </linearGradient>
        <linearGradient id="lg-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2030" /><stop offset="1" stopColor="#0a0c12" />
        </linearGradient>
      </defs>
      <path d="M32 3 55 16.5v31L32 61 9 47.5v-31Z" fill="url(#lg-b)" stroke="url(#lg-g)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 9 49 19v26L32 55 15 45V19Z" fill="none" stroke="#f0b44c" strokeOpacity=".28" strokeWidth="1.2"/>
  <path d="M22 18h11c9 0 14 5.5 14 14s-5 14-14 14H22Z" fill="url(#lg-g)" />
      <circle cx="35" cy="29.5" r="4.2" fill="#0a0c12" />
      <path d="M33 31h4l1.6 9h-7.2Z" fill="#0a0c12" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.14em]">
        <span className="text-gold-grad">Deadlock</span>
        <span className="block text-[10px] font-medium tracking-[0.42em] text-muted">Tracker</span>
      </span>
    </span>
  );
}
