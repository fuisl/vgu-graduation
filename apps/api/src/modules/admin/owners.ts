/**
 * Owners approve, reject and revoke admins (#119, decided 2026-09-30). They are
 * always admins, even without an `admin_accounts` row, and their own access
 * cannot be changed from the dashboard: edit this list in a reviewed PR.
 * Lowercase GitHub handles.
 */
export const ADMIN_OWNERS: readonly string[] = ["fuisl"];

export function isOwner(handle: string): boolean {
  return ADMIN_OWNERS.includes(handle.toLowerCase());
}
