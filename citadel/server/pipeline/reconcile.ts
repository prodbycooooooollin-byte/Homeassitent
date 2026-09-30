// Abgleich eines validierten Kandidaten mit dem veröffentlichten Stand.
// Reine Funktion – vollständig testbar, keine Datenbankzugriffe.

export type Origin = 'auto-primary' | 'third-party' | 'manual-confirmed';

export interface ObsLike {
  value: string;
  origin: Origin;
  sourceUrl: string;
  publishedAt: string | null;
  validation: 'valid' | 'invalid' | 'unclear';
}

export type Decision =
  | { action: 'reject'; reason: string }
  | { action: 'candidate'; reason: string }
  | { action: 'publish'; kind: 'new' | 'changed'; reason: string }
  | { action: 'confirm'; reason: string }
  | { action: 'conflict'; reason: string };

const PRIO: Record<Origin, number> = { 'manual-confirmed': 3, 'auto-primary': 2, 'third-party': 1 };

export function reconcile(current: ObsLike | null, cand: ObsLike, identityLinked: boolean): Decision {
  if (cand.validation === 'invalid') return { action: 'reject', reason: 'Validierung fehlgeschlagen' };
  if (cand.validation === 'unclear') return { action: 'candidate', reason: 'Unklarer Wert – bleibt ungeklärter Kandidat' };
  if (!identityLinked) return { action: 'candidate', reason: 'Zuordnung zum Spieler nicht belegt' };
  if (!current) return { action: 'publish', kind: 'new', reason: 'Erster belegter Wert' };
  if (current.value === cand.value) return { action: 'confirm', reason: 'Gleicher Wert erneut gesehen' };
  if (current.sourceUrl === cand.sourceUrl && PRIO[cand.origin] >= PRIO[current.origin]) {
    return { action: 'publish', kind: 'changed', reason: 'Dieselbe Quelle meldet einen neuen Wert' };
  }
  const pc = PRIO[cand.origin];
  const pk = PRIO[current.origin];
  const tc = cand.publishedAt ? Date.parse(cand.publishedAt) : NaN;
  const tk = current.publishedAt ? Date.parse(current.publishedAt) : NaN;
  if (pc > pk && (Number.isNaN(tk) || Number.isNaN(tc) || tc >= tk)) {
    return { action: 'publish', kind: 'changed', reason: 'Höher priorisierte Quelle (Primärquelle des Spielers)' };
  }
  if (pc >= pk && Number.isFinite(tc) && Number.isFinite(tk) && tc > tk) {
    return { action: 'publish', kind: 'changed', reason: 'Belegt neueres Einstellungsdatum' };
  }
  return {
    action: 'conflict',
    reason:
      pc < pk
        ? 'Widerspruch zu einer höher priorisierten Quelle – bestehender Wert bleibt'
        : 'Widerspruch ohne belegtes neueres Datum – bestehender Wert bleibt (Abrufdatum zählt nicht als Bestätigung)',
  };
}
