/**
 * Countries the platform tells apart, with the calling code that identifies each. The country is
 * derived from the phone number once, at registration, and stored on the user -- from then on the
 * stored value is the truth, because a person can change it and a number does not always say where
 * someone lives.
 *
 * Keep in step with the backfill CASE in the `push_management` migration.
 */
export interface CountryInfo {
  code: string;
  /** Calling code without the leading +. */
  dial: string;
  name: { ru: string; en: string; tkm: string };
}

export const SUPPORTED_COUNTRIES: CountryInfo[] = [
  { code: "TM", dial: "993", name: { ru: "Туркменистан", en: "Turkmenistan", tkm: "Türkmenistan" } },
  { code: "RU", dial: "7", name: { ru: "Россия", en: "Russia", tkm: "Russiýa" } },
  { code: "KZ", dial: "7", name: { ru: "Казахстан", en: "Kazakhstan", tkm: "Gazagystan" } },
  { code: "CN", dial: "86", name: { ru: "Китай", en: "China", tkm: "Hytaý" } },
  { code: "TR", dial: "90", name: { ru: "Турция", en: "Türkiye", tkm: "Türkiýe" } },
  { code: "UZ", dial: "998", name: { ru: "Узбекистан", en: "Uzbekistan", tkm: "Özbegistan" } },
  { code: "KG", dial: "996", name: { ru: "Кыргызстан", en: "Kyrgyzstan", tkm: "Gyrgyzystan" } },
  { code: "TJ", dial: "992", name: { ru: "Таджикистан", en: "Tajikistan", tkm: "Täjigistan" } },
  { code: "AZ", dial: "994", name: { ru: "Азербайджан", en: "Azerbaijan", tkm: "Azerbaýjan" } },
  { code: "GE", dial: "995", name: { ru: "Грузия", en: "Georgia", tkm: "Gruziýa" } },
  { code: "AM", dial: "374", name: { ru: "Армения", en: "Armenia", tkm: "Ermenistan" } },
  { code: "BY", dial: "375", name: { ru: "Беларусь", en: "Belarus", tkm: "Belarus" } },
  { code: "UA", dial: "380", name: { ru: "Украина", en: "Ukraine", tkm: "Ukraina" } },
  { code: "AE", dial: "971", name: { ru: "ОАЭ", en: "United Arab Emirates", tkm: "Birleşen Arap Emirlikleri" } },
  { code: "IR", dial: "98", name: { ru: "Иран", en: "Iran", tkm: "Eýran" } },
  { code: "DE", dial: "49", name: { ru: "Германия", en: "Germany", tkm: "Germaniýa" } },
  { code: "GB", dial: "44", name: { ru: "Великобритания", en: "United Kingdom", tkm: "Beýik Britaniýa" } },
  { code: "US", dial: "1", name: { ru: "США", en: "United States", tkm: "ABŞ" } },
];

export const COUNTRY_CODES = SUPPORTED_COUNTRIES.map((c) => c.code);

/**
 * Best guess of the country for an international number, or null when it cannot be told.
 * `+7` is shared by Russia and Kazakhstan; Kazakh mobile and landline ranges start +76/+77.
 */
export function countryFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits || !phone.trim().startsWith("+")) return null;

  if (digits.startsWith("7")) return digits[1] === "6" || digits[1] === "7" ? "KZ" : "RU";

  let best: CountryInfo | null = null;
  for (const country of SUPPORTED_COUNTRIES) {
    if (country.dial === "7") continue;
    if (digits.startsWith(country.dial) && (!best || country.dial.length > best.dial.length)) best = country;
  }
  return best?.code ?? null;
}
