import { isStaffRole } from "./staff-role";

describe("isStaffRole", () => {
  it.each(["ADMIN", "MANAGER", "SUPPORT"])("allows %s to act on customer commerce data", (role) => {
    expect(isStaffRole(role)).toBe(true);
  });

  it.each(["CUSTOMER", "SELLER", "API_PARTNER", "", "UNKNOWN"])("does not treat %s as staff", (role) => {
    expect(isStaffRole(role)).toBe(false);
  });
});
