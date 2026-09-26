import { memo } from 'react';

/**
 * Zwölf eigene, stilisierte Figuren im Sticker-Stil (reines SVG).
 * Kopf-Form, Augen, Mund und Accessoire werden kombiniert.
 */
type Shape = 'round' | 'square' | 'tall' | 'wide' | 'drop' | 'bean';
type Eyes = 'dots' | 'sleepy' | 'side' | 'wide' | 'visor' | 'glasses';
type Mouth = 'smile' | 'flat' | 'o' | 'smirk' | 'grin' | 'teeth';
type Extra = 'beanie' | 'cap' | 'ears' | 'antenna' | 'bow' | 'horns' | 'headphones' | 'mustache' | 'freckles' | 'leaf' | 'crest' | 'none';

interface Def {
  name: string;
  bg: string;
  head: string;
  shape: Shape;
  eyes: Eyes;
  mouth: Mouth;
  extra: Extra;
  extraColor: string;
}

export const AVATARS: Def[] = [
  { name: 'Fuchs', bg: '#2b3a67', head: '#ffb067', shape: 'drop', eyes: 'side', mouth: 'smirk', extra: 'ears', extraColor: '#ff8a3d' },
  { name: 'Nebel', bg: '#23405a', head: '#8fd6ff', shape: 'round', eyes: 'sleepy', mouth: 'flat', extra: 'beanie', extraColor: '#ff6f61' },
  { name: 'Limette', bg: '#2e4a3a', head: '#b7f07e', shape: 'bean', eyes: 'wide', mouth: 'o', extra: 'leaf', extraColor: '#4fbf6a' },
  { name: 'Rosé', bg: '#4a2a4a', head: '#ff9fbf', shape: 'round', eyes: 'dots', mouth: 'smile', extra: 'bow', extraColor: '#ff5f8f' },
  { name: 'Lila', bg: '#3a2d5e', head: '#c8aaff', shape: 'tall', eyes: 'visor', mouth: 'grin', extra: 'antenna', extraColor: '#3fd8c8' },
  { name: 'Sonne', bg: '#4d3b1f', head: '#ffd966', shape: 'wide', eyes: 'glasses', mouth: 'smile', extra: 'cap', extraColor: '#3f7bff' },
  { name: 'Minze', bg: '#1f4744', head: '#74e8cc', shape: 'square', eyes: 'side', mouth: 'flat', extra: 'headphones', extraColor: '#1a1f33' },
  { name: 'Glut', bg: '#4d2323', head: '#ff8b76', shape: 'drop', eyes: 'wide', mouth: 'teeth', extra: 'horns', extraColor: '#fff1d6' },
  { name: 'Eis', bg: '#27305c', head: '#a9bcff', shape: 'bean', eyes: 'sleepy', mouth: 'smirk', extra: 'crest', extraColor: '#ff6f61' },
  { name: 'Pfirsich', bg: '#4a3326', head: '#f5c7a1', shape: 'round', eyes: 'dots', mouth: 'grin', extra: 'mustache', extraColor: '#5a3a28' },
  { name: 'Kaktus', bg: '#243f2c', head: '#92e3a9', shape: 'tall', eyes: 'glasses', mouth: 'o', extra: 'freckles', extraColor: '#3f8f5a' },
  { name: 'Orchidee', bg: '#40264f', head: '#e3a8ff', shape: 'wide', eyes: 'visor', mouth: 'smile', extra: 'none', extraColor: '#fff' },
];

const INK = '#1a1f33';

function headPath(shape: Shape): string {
  switch (shape) {
    case 'round':
      return 'M50 22c17 0 28 11 28 28S67 80 50 80 22 67 22 50s11-28 28-28z';
    case 'square':
      return 'M30 24h40c5 0 8 3 8 8v38c0 5-3 8-8 8H30c-5 0-8-3-8-8V32c0-5 3-8 8-8z';
    case 'tall':
      return 'M50 18c14 0 24 9 24 24v22c0 11-10 18-24 18s-24-7-24-18V42c0-15 10-24 24-24z';
    case 'wide':
      return 'M50 28c20 0 32 9 32 24s-12 28-32 28-32-13-32-28 12-24 32-24z';
    case 'drop':
      return 'M50 18c10 10 28 20 28 38 0 14-12 24-28 24S22 70 22 56c0-18 18-28 28-38z';
    case 'bean':
      return 'M44 22c20-2 34 10 34 28 0 20-14 30-30 30-16 0-26-10-26-26 0-18 6-31 22-32z';
  }
}

function EyesSvg({ eyes }: { eyes: Eyes }) {
  switch (eyes) {
    case 'dots':
      return (
        <g fill={INK}>
          <circle cx="40" cy="50" r="4.5" />
          <circle cx="60" cy="50" r="4.5" />
          <circle cx="41.5" cy="48.5" r="1.4" fill="#fff" />
          <circle cx="61.5" cy="48.5" r="1.4" fill="#fff" />
        </g>
      );
    case 'sleepy':
      return (
        <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M34 51q6 4 12 0" />
          <path d="M54 51q6 4 12 0" />
        </g>
      );
    case 'side':
      return (
        <g>
          <ellipse cx="40" cy="50" rx="7" ry="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <ellipse cx="60" cy="50" rx="7" ry="6" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx="43" cy="51" r="3" fill={INK} />
          <circle cx="63" cy="51" r="3" fill={INK} />
          <path d="M33 43l12 2M55 45l12-2" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'wide':
      return (
        <g>
          <circle cx="39" cy="49" r="8" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx="61" cy="49" r="8" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx="39" cy="50" r="3.6" fill={INK} />
          <circle cx="61" cy="50" r="3.6" fill={INK} />
        </g>
      );
    case 'visor':
      return (
        <g>
          <rect x="28" y="42" width="44" height="14" rx="7" fill={INK} />
          <rect x="33" y="46" width="12" height="4" rx="2" fill="#3fd8c8" />
          <rect x="55" y="46" width="12" height="4" rx="2" fill="#3fd8c8" />
        </g>
      );
    case 'glasses':
      return (
        <g>
          <circle cx="39" cy="50" r="8" fill="#ffffff55" stroke={INK} strokeWidth="3" />
          <circle cx="61" cy="50" r="8" fill="#ffffff55" stroke={INK} strokeWidth="3" />
          <path d="M47 50h6" stroke={INK} strokeWidth="3" />
          <circle cx="40" cy="51" r="2.6" fill={INK} />
          <circle cx="62" cy="51" r="2.6" fill={INK} />
        </g>
      );
  }
}

function MouthSvg({ mouth }: { mouth: Mouth }) {
  const common = { stroke: INK, strokeWidth: 3.5, strokeLinecap: 'round' as const, fill: 'none' };
  switch (mouth) {
    case 'smile':
      return <path d="M42 64q8 7 16 0" {...common} />;
    case 'flat':
      return <path d="M43 66h14" {...common} />;
    case 'o':
      return <ellipse cx="50" cy="66" rx="4" ry="5" fill={INK} />;
    case 'smirk':
      return <path d="M42 66q9 3 16-4" {...common} />;
    case 'grin':
      return <path d="M40 62q10 12 20 0z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
    case 'teeth':
      return (
        <g>
          <rect x="40" y="61" width="20" height="9" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
          <path d="M50 61v9" stroke={INK} strokeWidth="2" />
        </g>
      );
  }
}

function ExtraBack({ extra, c }: { extra: Extra; c: string }) {
  switch (extra) {
    case 'ears':
      return (
        <g fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M28 40L24 14l20 14z" />
          <path d="M72 40l4-26-20 14z" />
        </g>
      );
    case 'horns':
      return (
        <g fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M32 34c-8-4-10-14-6-20 2 8 8 10 14 12z" />
          <path d="M68 34c8-4 10-14 6-20-2 8-8 10-14 12z" />
        </g>
      );
    case 'antenna':
      return (
        <g>
          <path d="M50 20V8" stroke={INK} strokeWidth="3" />
          <circle cx="50" cy="8" r="5" fill={c} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'leaf':
      return <path d="M50 24c-2-10 6-16 16-16-2 10-8 16-16 16z" fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
    case 'crest':
      return <path d="M40 26c2-10 6-14 10-18 2 6 6 8 10 6-2 6-4 10-8 12z" fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
    default:
      return null;
  }
}

function ExtraFront({ extra, c }: { extra: Extra; c: string }) {
  switch (extra) {
    case 'beanie':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M24 40c0-16 12-24 26-24s26 8 26 24z" fill={c} />
          <rect x="21" y="36" width="58" height="9" rx="4.5" fill="#fff1d6" />
          <circle cx="50" cy="14" r="5" fill="#fff1d6" />
        </g>
      );
    case 'cap':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M22 42c0-14 12-20 28-20s28 6 28 20z" fill={c} />
          <path d="M60 40c10-2 20 0 26 4-8 2-18 2-26 0z" fill={c} />
        </g>
      );
    case 'bow':
      return (
        <g fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M60 22l14-8v16z" />
          <path d="M60 22l-14-8v16z" transform="translate(0 0)" />
          <circle cx="60" cy="22" r="4" />
        </g>
      );
    case 'headphones':
      return (
        <g stroke={INK} strokeWidth="3" fill={c}>
          <path d="M22 50c0-20 12-30 28-30s28 10 28 30" fill="none" strokeWidth="5" />
          <rect x="15" y="44" width="12" height="20" rx="5" fill="#ff6f61" />
          <rect x="73" y="44" width="12" height="20" rx="5" fill="#ff6f61" />
        </g>
      );
    case 'mustache':
      return <path d="M38 62c4-4 8-4 12 0 4-4 8-4 12 0-4 4-8 3-12 0-4 3-8 4-12 0z" fill={c} stroke={INK} strokeWidth="2" />;
    case 'freckles':
      return (
        <g fill={c}>
          <circle cx="33" cy="58" r="1.8" />
          <circle cx="37" cy="61" r="1.8" />
          <circle cx="30" cy="62" r="1.8" />
          <circle cx="67" cy="58" r="1.8" />
          <circle cx="63" cy="61" r="1.8" />
          <circle cx="70" cy="62" r="1.8" />
        </g>
      );
    default:
      return null;
  }
}

export const Avatar = memo(function Avatar({ id, size = 48, title }: { id: number; size?: number; title?: string }) {
  const d = AVATARS[((id % AVATARS.length) + AVATARS.length) % AVATARS.length];
  return (
    <svg
      className="avatar"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? `Figur ${d.name}`}
    >
      <rect x="2" y="2" width="96" height="96" rx="26" fill={d.bg} />
      <circle cx="50" cy="104" r="36" fill="#ffffff10" />
      <ExtraBack extra={d.extra} c={d.extraColor} />
      <path d={headPath(d.shape)} fill={d.head} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d={headPath(d.shape)} fill="none" stroke="#ffffff66" strokeWidth="2" transform="translate(-2 -2) scale(1.0)" opacity="0.35" />
      <circle cx="33" cy="60" r="4" fill="#ff6f6155" />
      <circle cx="67" cy="60" r="4" fill="#ff6f6155" />
      <EyesSvg eyes={d.eyes} />
      <MouthSvg mouth={d.mouth} />
      <ExtraFront extra={d.extra} c={d.extraColor} />
    </svg>
  );
});
