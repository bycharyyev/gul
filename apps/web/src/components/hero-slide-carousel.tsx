"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeSlideDetailDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";

const AUTO_ADVANCE_MS = 6000;

export function HeroSlideCarousel() {
  const { t } = useTranslation();
  const router = useRouter();
  const [slides, setSlides] = useState<HomeSlideDetailDto[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onscreen, setOnscreen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listHomeSlides().then(setSlides).catch(() => {});
  }, []);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setOnscreen(entry?.isIntersecting ?? false), {
      threshold: 0.3,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (slides.length ? (i + 1) % slides.length : 0));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (slides.length ? (i - 1 + slides.length) % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (paused || reducedMotion || !onscreen || slides.length < 2) return;
    const id = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion, onscreen, slides.length, goNext]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion || !tiltRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.transform = `perspective(1200px) rotateY(${px * 4}deg) rotateX(${-py * 4}deg) scale(1.01)`;
    tiltRef.current.style.setProperty("--glow-x", `${(px + 0.5) * 100}%`);
    tiltRef.current.style.setProperty("--glow-y", `${(py + 0.5) * 100}%`);
  }

  function handleMouseLeave() {
    if (!tiltRef.current) return;
    tiltRef.current.style.transform = "perspective(1200px) rotateY(0deg) rotateX(0deg) scale(1)";
  }

  function handleCta(slide: HomeSlideDetailDto) {
    if (slide.linkType === "INTERNAL_SERVICE" && slide.serviceId) {
      router.push(`/?serviceId=${slide.serviceId}#topup`);
    } else if (slide.linkType === "GALLERY_PRODUCT" && slide.galleryProduct) {
      router.push(`/gallery?search=${encodeURIComponent(slide.galleryProduct.sku)}`);
    } else if (slide.linkType === "SELLER_SHOP" && slide.seller) {
      router.push(`/@${slide.seller.handle}`);
    } else if (slide.externalUrl) {
      window.open(slide.externalUrl, "_blank", "noopener,noreferrer");
    }
  }

  if (slides.length === 0) return null;

  const slide = slides[index];
  if (!slide) return null;

  const hasCta =
    slide.serviceId ||
    slide.externalUrl ||
    (slide.linkType === "GALLERY_PRODUCT" && slide.galleryProduct) ||
    (slide.linkType === "SELLER_SHOP" && slide.seller);

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label={t("web.heroSlides.ariaLabel")}
      className="border-b border-slate-200/70 dark:border-white/10"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        handleMouseLeave();
      }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div
          className="group relative overflow-hidden rounded-[28px] [perspective:1200px]"
          onMouseMove={handleMouseMove}
        >
          <div
            ref={tiltRef}
            className="relative h-[220px] w-full transition-transform duration-300 ease-out will-change-transform sm:h-[300px] lg:h-[380px]"
            style={{
              // Cursor-reactive sheen — purely decorative, driven by --glow-x/--glow-y set on mousemove.
              backgroundImage:
                "radial-gradient(600px circle at var(--glow-x, 50%) var(--glow-y, 50%), rgba(255,255,255,0.18), transparent 45%)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={slide.id}
              src={slide.imageUrl}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${
                reducedMotion ? "" : "animate-hero-slide-fade-in"
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/0" />

            {/* Glass panel */}
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-xl sm:inset-x-6 sm:bottom-6 sm:max-w-md sm:p-6 dark:border-white/15 dark:bg-black/20">
              {(slide.sponsorLabel || slide.sellerId) && (
                <span className="mb-2 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {t("web.heroSlides.sponsoredLabel")}
                  {slide.sponsorLabel ? ` · ${slide.sponsorLabel}` : ""}
                </span>
              )}
              <h2 className="text-lg font-bold text-white sm:text-2xl">{slide.title}</h2>
              {slide.subtitle && <p className="mt-1 text-xs text-white/80 sm:text-sm">{slide.subtitle}</p>}
              {hasCta && (
                <button
                  onClick={() => handleCta(slide)}
                  className="mt-3 cursor-pointer rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-900 shadow-soft hover:brightness-95 sm:text-sm"
                >
                  {slide.ctaLabel || t("web.heroSlides.defaultCta")}
                </button>
              )}
            </div>

            {slides.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  aria-label={t("web.heroSlides.prevAriaLabel")}
                  className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-white/20 group-hover:opacity-100 sm:flex"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  onClick={goNext}
                  aria-label={t("web.heroSlides.nextAriaLabel")}
                  className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-white/20 group-hover:opacity-100 sm:flex"
                >
                  <ChevronIcon direction="right" />
                </button>
              </>
            )}
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={t("web.heroSlides.slideAriaLabel", { n: i + 1 })}
                aria-current={i === index}
                className={`h-1.5 cursor-pointer rounded-full transition-all ${
                  i === index ? "w-6 bg-gradient-brand" : "w-1.5 bg-slate-300 dark:bg-white/20"
                }`}
              />
            ))}
            <button
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? t("web.heroSlides.resumeAriaLabel") : t("web.heroSlides.pauseAriaLabel")}
              aria-pressed={paused}
              className="ml-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d={direction === "left" ? "M12.5 15l-5-5 5-5" : "M7.5 15l5-5-5-5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="3" y="2" width="3" height="12" rx="1" />
      <rect x="10" y="2" width="3" height="12" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 2.5v11l10-5.5-10-5.5z" />
    </svg>
  );
}
