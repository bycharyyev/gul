export { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, LOCALE_BCP47, isLocale, type Locale } from "./locale.js";
export { dictionaries, type Dictionary } from "./dictionaries.js";
export {
  I18nProvider,
  useI18n,
  useTranslation,
  translateError,
  type I18nContextValue,
  type I18nProviderProps,
} from "./context.js";
export { LanguageSwitcher, type LanguageSwitcherProps } from "./language-switcher.js";
