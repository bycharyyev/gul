import { useEffect } from "react";
import { I18nProvider, useI18n, isLocale, type Locale } from "@topup-hub/i18n";
import { api, isAuthenticated, getCurrentUser, storeCurrentUser } from "@/lib/api";

function LocaleSync() {
  const { locale, setLocale } = useI18n();

  useEffect(() => {
    const cached = getCurrentUser();
    if (cached && isLocale(cached.locale) && cached.locale !== locale) {
      setLocale(cached.locale, { persist: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function handleLocaleChange(locale: Locale) {
  if (!isAuthenticated()) return;
  api
    .updateLocale(locale)
    .then((updated) => storeCurrentUser(updated))
    .catch(() => {});
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider onLocaleChange={handleLocaleChange}>
      <LocaleSync />
      {children}
    </I18nProvider>
  );
}
