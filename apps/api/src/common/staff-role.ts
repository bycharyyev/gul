/** Roles allowed to operate on another customer's commerce data. */
const STAFF_ROLES = new Set(["ADMIN", "MANAGER", "SUPPORT"]);

export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role);
}
