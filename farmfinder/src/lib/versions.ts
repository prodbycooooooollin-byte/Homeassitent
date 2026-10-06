export const VERSIONS = [
  '26.3', '26.2', '26.1',
  '1.21', '1.20', '1.19', '1.18', '1.17', '1.16', '1.15', '1.14', '1.13', '1.12', '1.8',
];

export type VersionMatch = 'yes' | 'unknown' | 'no';

export function parseVersion(v: string): number[] {
  return v.replace('+', '').split('.').map((n) => parseInt(n, 10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const family = (v: string) => parseVersion(v).slice(0, 2).join('.');

// Erkennt "1.21.4", "26.3", "1.20+" – ignoriert Zeitstempel ("1:21") und Faktoren ("1.5x").
const VERSION_RE = /(?<![\d.:])(26\.\d{1,2}(?:\.\d{1,2})?|1\.(?:[89]|[12]\d)(?:\.\d{1,2})?)(\+)?(?![\d:])/g;

export function detectVersions(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(VERSION_RE)) found.add(m[1] + (m[2] ?? ''));
  return [...found].sort((a, b) => compareVersions(b, a));
}

/** Passt ein Video zur gewählten Version? "1.20+" gilt für alles ab 1.20. */
export function matchVersion(detected: string[], selected: string | null): VersionMatch {
  if (!selected) return 'yes';
  if (detected.length === 0) return 'unknown';
  for (const d of detected) {
    if (d.endsWith('+')) {
      if (compareVersions(selected, d) >= 0) return 'yes';
    } else if (family(d) === family(selected)) return 'yes';
  }
  return 'no';
}
