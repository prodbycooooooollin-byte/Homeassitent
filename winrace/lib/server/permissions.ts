import type { MemberStatus, RoomRole } from "@prisma/client";

/**
 * Zentrale, rein serverseitige Berechtigungslogik. Das Frontend blendet
 * Aktionen anhand derselben Regeln nur *aus* (bessere UX) – durchgesetzt
 * wird ausschließlich hier, in jedem betroffenen Route-Handler erneut
 * geprüft. Kein Endpoint darf sich auf clientseitige Rollenanzeige
 * verlassen.
 */

export interface PermissionMember {
  role: RoomRole;
  status: MemberStatus;
  isTeamLead: boolean;
  teamId: string | null;
}

export interface PermissionRoomSettings {
  allowMemberProgress: boolean;
  onlyTeamLeadEdits: boolean;
  teamsLocked: boolean;
}

function isActive(member: PermissionMember | null | undefined): member is PermissionMember {
  return Boolean(member) && member!.status === "ACTIVE";
}

export function isHost(member: PermissionMember | null | undefined): boolean {
  return isActive(member) && member.role === "HOST";
}

export function isTeamLeadOf(member: PermissionMember | null | undefined, teamId: string): boolean {
  return isActive(member) && member.isTeamLead && member.teamId === teamId;
}

export function isTeamMemberOf(member: PermissionMember | null | undefined, teamId: string): boolean {
  return isActive(member) && member.teamId === teamId;
}

/** Host-only: Challenge-Einstellungen, Spiele-Liste, Teams benennen/gestalten, Overlay-Konfiguration, Lifecycle. */
export function canManageRoom(member: PermissionMember | null | undefined): boolean {
  return isHost(member);
}

/** Fortschritt für ein bestimmtes Team ändern (+1/-1, Korrektur, aktuelles Spiel wählen). */
export function canUpdateTeamProgress(
  member: PermissionMember | null | undefined,
  teamId: string,
  settings: PermissionRoomSettings
): boolean {
  if (isHost(member)) return true;
  if (!isActive(member) || member.teamId !== teamId) return false;
  if (member.isTeamLead) return true;
  if (settings.onlyTeamLeadEdits) return false;
  return settings.allowMemberProgress;
}

/** Beweise/Kommentare zu einem Sieg hinzufügen – bewusst niedrigere Hürde als Fortschritt selbst ändern. */
export function canAddEvidence(member: PermissionMember | null | undefined, teamId: string): boolean {
  return isHost(member) || isTeamMemberOf(member, teamId);
}

export function canConfirmWinner(member: PermissionMember | null | undefined): boolean {
  return isHost(member);
}

export function canManageMembers(member: PermissionMember | null | undefined): boolean {
  return isHost(member);
}

/** Ein Mitglied darf sich selbst ein Team aussuchen (kein manuelles Zuweisen durch den Host). */
export function canSelfAssignTeam(member: PermissionMember | null | undefined, settings: PermissionRoomSettings): boolean {
  return isActive(member) && !settings.teamsLocked;
}

export function canManageOverlay(member: PermissionMember | null | undefined): boolean {
  return isHost(member);
}

export function canViewPrivateRoom(member: PermissionMember | null | undefined): boolean {
  return isActive(member);
}
