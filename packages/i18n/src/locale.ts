export type Locale = "ru" | "en" | "tkm";

export const LOCALES: Locale[] = ["ru", "en", "tkm"];

export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  tkm: "Türkmençe",
};

/** BCP 47 tags for Intl/toLocaleString formatting. */
export const LOCALE_BCP47: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
  tkm: "tk-TM",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}
