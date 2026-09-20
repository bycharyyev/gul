import { COUNTRY_CODES, countryFromPhone } from "./phone-country";

describe("countryFromPhone", () => {
  it.each([
    ["+99361234567", "TM"],
    ["+79172786543", "RU"],
    ["+77012345678", "KZ"],
    ["+76001234567", "KZ"],
    ["+8613800138000", "CN"],
    ["+905321234567", "TR"],
    ["+998901234567", "UZ"],
    ["+996555123456", "KG"],
    ["+380501234567", "UA"],
    ["+12025550123", "US"],
    ["+447911123456", "GB"],
  ])("%s -> %s", (phone, country) => {
    expect(countryFromPhone(phone)).toBe(country);
  });

  it("takes the longest calling code, so +993 is not read as +99...", () => {
    expect(countryFromPhone("+993 61 234567")).toBe("TM");
    expect(countryFromPhone("+994501234567")).toBe("AZ");
  });

  it("returns null when the country cannot be told", () => {
    expect(countryFromPhone("+2547123456789")).toBeNull();
    expect(countryFromPhone("89172786543")).toBeNull();
    expect(countryFromPhone("")).toBeNull();
    expect(countryFromPhone(null)).toBeNull();
  });

  it("only ever returns a code the rest of the system knows", () => {
    for (const phone of ["+99361234567", "+79172786543", "+8613800138000", "+905321234567"]) {
      expect(COUNTRY_CODES).toContain(countryFromPhone(phone));
    }
  });
});
