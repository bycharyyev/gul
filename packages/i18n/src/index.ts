export { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, LOCALE_BCP47, isLocale, type Locale } from "./locale.js";
// Types only: the dictionaries themselves are imported per app -- "@topup-hub/i18n/dictionaries"
// (everything, the admin console) or "@topup-hub/i18n/locales/web/<locale>" (the storefront) --
// so importing this entry point never pulls every string of every app into a bundle.
export type { Dictionary } from "./dictionaries.js";
export {
  I18nProvider,
  useI18n,
  useTranslation,
  translateError,
  type I18nContextValue,
  type I18nProviderProps,
} from "./context.js";
export { LanguageSwitcher, type LanguageSwitcherProps } from "./language-switcher.js";
