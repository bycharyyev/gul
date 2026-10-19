import { normalizePhone, PHONE_PATTERN } from "./phone";

describe("seller phone", () => {
  it("drops spaces, dashes and brackets before storing", () => {
    expect(normalizePhone("+993 (61) 12-34-56")).toBe("+99361123456");
  });

  it("accepts a plain or plus-prefixed number of 7 to 15 digits", () => {
    expect(PHONE_PATTERN.test("+99361234567")).toBe(true);
    expect(PHONE_PATTERN.test("61234567")).toBe(true);
  });

  it("refuses free text and too-short numbers", () => {
    expect(PHONE_PATTERN.test("bMDOHkDHhYPLoZSI")).toBe(false);
    expect(PHONE_PATTERN.test("123456")).toBe(false);
    expect(PHONE_PATTERN.test("+1234567890123456")).toBe(false);
  });
});
