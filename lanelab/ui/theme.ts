// Colors and sizes in one place, so the whole interface changes together.
export const ACCENTS: Record<string, string> = {
  coral: '#ff6f61',
  gold: '#ffd34d',
  cyan: '#4fd8ff',
  violet: '#b78bff',
}

export const C = {
  scrim: '#05040699',
  panel: '#0e0c0ff2',
  card: '#171315f5',
  cardHi: '#221b1ef5',
  line: '#ffffff1a',
  text: '#f6f1ea',
  dim: '#a39a93',
  good: '#7dff9c',
  bad: '#ff5d5d',
  warn: '#ffb84d',
  info: '#ffffff',
}

export const toneColor = (tone: string | undefined): string | undefined => {
  switch (tone) {
    case 'good': return C.good
    case 'bad': return C.bad
    case 'warn': return C.warn
    default: return undefined
  }
}

export function accentOf(setting: string | undefined): string {
  return ACCENTS[setting ?? 'coral'] ?? (ACCENTS.coral as string)
}
