import { DEFAULT_LOCALE, type Dictionary, type Locale } from "@topup-hub/i18n";
import ru from "@topup-hub/i18n/locales/web/ru";

// Only the default locale is bundled: it is what the server renders and what every visitor sees
// first. en/tkm become separate chunks fetched the first time someone switches to them, instead of
// every visitor downloading and parsing all three (plus, until this split, the admin console's).
export const webDictionaries: Partial<Record<Locale, Dictionary>> = { [DEFAULT_LOCALE]: ru };

export function loadWebDictionary(locale: Locale): Promise<Dictionary> {
  switch (locale) {
    case "en":
      return import("@topup-hub/i18n/locales/web/en").then((m) => m.default);
    case "tkm":
      return import("@topup-hub/i18n/locales/web/tkm").then((m) => m.default);
    default:
      return Promise.resolve(ru);
  }
}
