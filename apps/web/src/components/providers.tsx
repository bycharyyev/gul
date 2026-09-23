"use client";

import { useEffect } from "react";
import { I18nProvider, useI18n, isLocale, type Locale } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";

function LocaleSync() {
  const { locale, setLocale } = useI18n();

  useEffect(() => {
    if (!isAuthenticated()) return;
    api
      .getMe()
      .then((me) => {
        if (isLocale(me.locale) && me.locale !== locale) {
          setLocale(me.locale, { persist: false });
        }
      })
      .catch(() => {});
    // Only sync once, right after mount -- not on every locale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function handleLocaleChange(locale: Locale) {
  if (isAuthenticated()) {
    api.updateLocale(locale).catch(() => {});
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider onLocaleChange={handleLocaleChange}>
      <LocaleSync />
      {children}
    </I18nProvider>
  );
}
