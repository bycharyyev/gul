"use client";

import Link from "next/link";
import { useTranslation } from "@topup-hub/i18n";
import { useConsent, writeConsent } from "@/lib/consent";

// A real choice: analytics (components/analytics.tsx) loads only after "accept", and "decline" is
// as easy as accepting. The old banner offered one "OK" button while the trackers loaded anyway.
export function CookieConsent() {
  const { t } = useTranslation();
  const { consent, ready } = useConsent();

  if (!ready || consent !== null) return null;

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
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => writeConsent("declined")}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
          >
            {t("web.cookieConsent.decline")}
          </button>
          <button
            onClick={() => writeConsent("accepted")}
            className="bg-gradient-brand cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            {t("web.cookieConsent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
