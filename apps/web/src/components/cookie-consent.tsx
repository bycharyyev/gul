"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@topup-hub/i18n";

const STORAGE_KEY = "gulyaly_cookie_consent";

export function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function accept() {
    window.localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-30 px-4 sm:bottom-4"
      role="region"
      aria-label={t("web.cookieConsent.ariaLabel")}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-xl2 border border-white/40 bg-white/80 p-4 text-sm text-slate-600 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-black/50 dark:text-slate-300 sm:flex-row sm:justify-between">
        <p>
          {t("web.cookieConsent.message")}{" "}
          <Link href="/pages/privacy" className="font-medium text-brand-600 underline dark:text-brand-300">
            {t("web.cookieConsent.moreLink")}
          </Link>
        </p>
        <button
          onClick={accept}
          className="bg-gradient-brand shrink-0 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {t("web.cookieConsent.accept")}
        </button>
      </div>
    </div>
  );
}
