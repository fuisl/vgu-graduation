/**
 * Decided 2026-09-28: all 4 current collaborators get admin access.
 * GitHub handles, lowercase (GitHub logins are case-insensitive).
 */
const ADMIN_ALLOWLIST = ["fuisl", "nhientruong04", "dducwsxuaan", "andrwpham"];

export function isAllowedAdmin(githubHandle: string): boolean {
  return ADMIN_ALLOWLIST.includes(githubHandle.toLowerCase());
}
