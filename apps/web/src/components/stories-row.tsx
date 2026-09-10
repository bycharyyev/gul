"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryDetailDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";

const STORY_DURATION_MS = 6000;

export function StoriesRow() {
  const { t } = useTranslation();
  const [stories, setStories] = useState<StoryDetailDto[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    api.listStories().then(setStories).catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  return (
    <section aria-label={t("web.stories.ariaLabel")} className="border-b border-slate-200/70 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stories.map((story, i) => (
          <button
            key={story.id}
            onClick={() => setActiveIndex(i)}
            className="flex shrink-0 cursor-pointer flex-col items-center gap-1.5 text-center"
          >
            <span className="border-gradient-brand relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[2px]">
              <span className="h-full w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={story.imageUrl} alt="" className="h-full w-full object-cover" />
              </span>
              {story.badgeLabel && (
                <span className="bg-gradient-brand absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-soft">
                  {story.badgeLabel}
                </span>
              )}
            </span>
            <span className="max-w-[68px] truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {story.title}
            </span>
          </button>
        ))}
      </div>

      {activeIndex !== null && (
        <StoryViewer stories={stories} initialIndex={activeIndex} onClose={() => setActiveIndex(null)} />
      )}
    </section>
  );
}

function StoryViewer({
  stories,
  initialIndex,
  onClose,
}: {
  stories: StoryDetailDto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  const story = stories[index];

  const goNext = useCallback(() => {
    if (index + 1 >= stories.length) {
      onClose();
    } else {
      setIndex(index + 1);
    }
  }, [index, stories.length, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    setProgress(0);
    startRef.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / STORY_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) goNext();
    }, 100);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion, index, goNext]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev]);

  function handleCta() {
    if (!story) return;
    if (story.linkType === "INTERNAL_SERVICE" && story.serviceId) {
      onClose();
      router.push(`/?serviceId=${story.serviceId}#topup`);
    } else if (story.linkType === "GALLERY_PRODUCT" && story.galleryProduct) {
      onClose();
      router.push(`/gallery?search=${encodeURIComponent(story.galleryProduct.sku)}`);
    } else if (story.linkType === "SELLER_SHOP" && story.seller) {
      onClose();
      router.push(`/@${story.seller.handle}`);
    } else if (story.externalUrl) {
      window.open(story.externalUrl, "_blank", "noopener,noreferrer");
    }
  }

  const hasCta =
    story &&
    (story.serviceId ||
      story.externalUrl ||
      (story.linkType === "GALLERY_PRODUCT" && story.galleryProduct) ||
      (story.linkType === "SELLER_SHOP" && story.seller));

  if (!story) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-full max-h-[720px] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-slate-900">
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2">
          {stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{
                  width: i < index ? "100%" : i === index ? `${progress}%` : "0%",
                  transition: reducedMotion ? "none" : "width 100ms linear",
                }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          aria-label={t("web.stories.closeAriaLabel")}
          className="absolute right-2 top-5 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50"
        >
          <CloseIcon />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.imageUrl} alt="" className="h-full w-full object-cover" />

        <button
          aria-label={t("web.stories.prevAriaLabel")}
          onClick={goPrev}
          className="absolute left-0 top-0 h-full w-1/3 cursor-pointer"
        />
        <button
          aria-label={t("web.stories.nextAriaLabel")}
          onClick={goNext}
          className="absolute right-0 top-0 h-full w-1/3 cursor-pointer"
        />

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pt-16">
          {(story.linkType === "PARTNER_AD" || story.sellerId) && (
            <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {t("web.stories.sponsoredLabel")}
              {story.sponsorLabel ? ` · ${story.sponsorLabel}` : ""}
            </span>
          )}
          {story.badgeLabel && (
            <span className="bg-gradient-brand ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
              {story.badgeLabel}
            </span>
          )}
          <h3 className="text-lg font-bold text-white">{story.title}</h3>
          {story.subtitle && <p className="text-sm text-white/80">{story.subtitle}</p>}
          {hasCta && (
            <button
              onClick={handleCta}
              className="bg-gradient-brand mt-2 w-full cursor-pointer rounded-lg py-2.5 text-sm font-semibold text-white shadow-soft hover:brightness-110"
            >
              {story.ctaLabel || t("web.stories.defaultCta")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
