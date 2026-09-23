"use client";

import { Suspense } from "react";
import { useTranslation } from "@topup-hub/i18n";
import { TopupWizard } from "@/components/topup-wizard";
import { StoriesRow } from "@/components/stories-row";
import { HeroSlideCarousel } from "@/components/hero-slide-carousel";

export default function HomePage() {
  const { t } = useTranslation();

  const titleBefore = t("web.home.titleBefore");
  const titleAfter = t("web.home.titleAfter");

  const highlights = [
    t("web.home.highlightInstant"),
    t("web.home.highlightRate"),
    t("web.home.highlightCurrencies"),
  ];

  return (
    <div>
      <HeroSlideCarousel />
      <StoriesRow />

      <section className="bg-hero-gradient border-b border-slate-200/70 dark:border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-xl">
            <Suspense fallback={null}>
              <TopupWizard />
            </Suspense>
          </div>

          <div className="mx-auto mt-10 max-w-2xl text-center">
            <span className="inline-flex items-center rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-white shadow-soft">
              {t("web.home.badge")}
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {titleBefore && <>{titleBefore} </>}
              <span className="text-gradient">{t("web.home.titleHighlight")}</span>
              {titleAfter && <> {titleAfter}</>}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("web.home.subtitle")}</p>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {highlights.map((title) => (
                <li key={title} className="flex items-center gap-1.5">
                  <CheckIcon />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-accent-500" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
