// Sensitivitätshelfer. eDPI ist eine reine Multiplikation und immer zulässig.
// cm/360 hängt von der Deadlock-internen Umrechnung ab (m_yaw). Die ConVar-Liste nennt m_yaw = 0.022,
// ob Deadlock Mausbewegungen genau als counts × sensitivity × m_yaw Grad umsetzt, ist NICHT verifiziert.
// Solange FORMULA_VERIFIED false ist, liefert cm360() bewusst kein Ergebnis.

export const FORMULA_VERIFIED = false;
export const M_YAW_DEFAULT = 0.022; // Quelle: OptiLock cvarlist.md (Standardwert, Flags cl, a, user, per_user)

export function eDpi(sensitivity: number | null, dpi: number | null): number | null {
  if (sensitivity === null || dpi === null || !(sensitivity > 0) || !(dpi > 0)) return null;
  return Math.round(sensitivity * dpi * 100) / 100;
}

export interface Cm360Result {
  value: number | null;
  explanation: string;
}

export function cm360(sensitivity: number | null, dpi: number | null, mYaw = M_YAW_DEFAULT): Cm360Result {
  if (!FORMULA_VERIFIED) {
    return {
      value: null,
      explanation:
        'Nicht berechnet: Die Deadlock-Umrechnung (Annahme: Grad = Counts × sensitivity × m_yaw mit m_yaw = 0.022) ist nicht im Spiel verifiziert. Werte aus anderen Spielen werden nicht übertragen.',
    };
  }
  if (sensitivity === null || dpi === null || !(sensitivity > 0) || !(dpi > 0)) return { value: null, explanation: 'Sensitivität und DPI müssen bekannt sein.' };
  const counts = 360 / (sensitivity * mYaw);
  return { value: Math.round((counts / dpi) * 2.54 * 100) / 100, explanation: `Annahme m_yaw = ${mYaw}.` };
}
