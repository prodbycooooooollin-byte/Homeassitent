import type { Role } from "@/lib/constants";

// Zentrale Berechtigungsregeln. Wird sowohl serverseitig (Route Handler /
// Server Actions - die eigentliche Durchsetzung) als auch clientseitig (UI
// ein-/ausblenden von Buttons) verwendet. Die UI-Nutzung ist nur Komfort;
// maßgeblich ist immer die serverseitige Prüfung.

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/** Mitglieder und Admins dürfen eigene Inhalte anlegen (Marker, Zeichnungen, Projekte, Ziele). */
export function canCreateContent(role: Role): boolean {
  return role === "ADMIN" || role === "MEMBER";
}

/** Nur der Ersteller/Besitzer oder ein Admin darf einen Eintrag bearbeiten/löschen. */
export function canEditEntity(role: Role, userId: string, ownerId: string): boolean {
  return role === "ADMIN" || userId === ownerId;
}

/** Serververbindung, Modpack-Freigabe, Rollenverwaltung: nur Admins. */
export function canManageServer(role: Role): boolean {
  return role === "ADMIN";
}

/** Besucher sehen alles Serverweite, können aber selbst nichts anlegen. */
export function canView(_role: Role): boolean {
  return true;
}
