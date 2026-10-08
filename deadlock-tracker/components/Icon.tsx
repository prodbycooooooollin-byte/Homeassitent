import type { SVGProps } from "react";

/** Eigenes Icon-Set (24×24, Linien-Stil) – ersetzt alle Emojis. */
const P: Record<string, React.ReactNode> = {
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></>,
  sword: <><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" y1="19" x2="19" y2="13" /><line x1="16" y1="16" x2="20" y2="20" /><line x1="19" y1="21" x2="21" y2="19" /></>,
  shield: <path d="M12 3l7 3v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z" />,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></>,
  star: <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z" />,
  skull: <><path d="M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.4 3 5.6V20h10v-3.4c1.8-1.2 3-3.1 3-5.6a8 8 0 0 0-8-8z" /><circle cx="9" cy="11" r="1.3" /><circle cx="15" cy="11" r="1.3" /><path d="M10.5 20v-2.5M13.5 20v-2.5" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  gem: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M9 3l-2 6 5 12 5-12-2-6" /></>,
  crown: <path d="M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c3 .2 5 2.3 5 5.3" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  plus: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  tower: <><path d="M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13z" /><path d="M10 21v-5h4v5" /></>,
  ghost: <><path d="M5 21V11a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z" /><circle cx="9.5" cy="11" r="1" fill="currentColor" /><circle cx="14.5" cy="11" r="1" fill="currentColor" /></>,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /></>,
  shuffle: <><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></>,
  medal: <><circle cx="12" cy="15" r="5.5" /><path d="M8.5 10.5L6 3h4l2 5 2-5h4l-2.5 7.5" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  swap: <><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  chevron: <path d="M9 5l7 7-7 7" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  book: <><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  fist: <><path d="M7 11V7a2 2 0 0 1 4 0v-1a2 2 0 0 1 4 0v1a2 2 0 0 1 4 2v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3 13a2 2 0 0 1 3-2z" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  zap: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  steam: <><circle cx="15" cy="9" r="3.6" /><circle cx="15" cy="9" r="1.3" /><path d="M11.6 10.6L4.5 14l.3 2.3 3-.4M12 14.5a3 3 0 1 1-2.6 4.4" /></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18" /></>,
  rocket: <><path d="M12 3c3 2 5 5.5 5 9l-2 3h-6l-2-3c0-3.5 2-7 5-9z" /><circle cx="12" cy="10" r="1.6" /><path d="M9 15l-2.5 4 3.5-1M15 15l2.5 4-3.5-1" /></>,
  badge: <><path d="M12 3l7 3v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z" /><path d="M9 12l2 2 4-4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: <><path d="M12 3.5l10 17.5H2z" /><path d="M12 10v5" /><circle cx="12" cy="18" r=".6" fill="currentColor" /></>,
  plusSign: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

export function Icon({ name, size = 18, className = "", ...rest }: { name: IconName; size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
      {P[name] ?? P.info}
    </svg>
  );
}
