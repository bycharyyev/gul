"use client";

import { useState } from "react";
import { getImageProps } from "next/image";
import { ImageBroken } from "@phosphor-icons/react/dist/ssr";

// Must match images.remotePatterns in next.config.ts. Anything else is passed through untouched,
// so /_next/image can never be used to fetch and re-encode an arbitrary third-party URL.
const OPTIMIZABLE_HOSTS = new Set(["open.s3.regru.cloud"]);

function optimizedSources(src: string, sizes: string) {
  let host: string;
  try {
    host = new URL(src).hostname;
  } catch {
    return null;
  }
  if (!OPTIMIZABLE_HOSTS.has(host)) return null;
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}

/**
 * A plain <img> that swaps to a soft placeholder instead of the browser's broken-image icon when
 * the URL 404s, times out, or was never set. Sources here are admin/seller-supplied (product
 * photos, avatars, story covers) and can go stale -- a deleted upload, a dead external CDN link --
 * with nothing on our side to catch it before render, so this is the one place that has to.
 *
 * Uploads to our own bucket are served through Next's image optimizer (resized to `sizes`,
 * re-encoded to AVIF/WebP): sellers upload 800px-3000px PNGs that the page shows at 40-400px,
 * and those raw files were most of the homepage's ~4.5 MB. If the optimizer fails, the raw file
 * is tried before giving up to the placeholder.
 *
 * className sizes and shapes the box either way (aspect ratio, rounding), so swapping to the
 * placeholder never reflows the layout around it.
 */
export function ImageWithFallback({
  src,
  alt,
  className,
  sizes = "100vw",
  fetchPriority,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** The rendered width, as for <img sizes>; picks which resized variant the browser downloads. */
  sizes?: string;
  /** "high" for the page's largest image (LCP), "low" for ones that are present but not shown yet. */
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [stage, setStage] = useState<"optimized" | "raw" | "broken">(src ? "optimized" : "broken");

  if (stage === "broken" || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-slate-100 text-slate-300 dark:bg-white/5 dark:text-slate-600 ${className || ""}`}
      >
        <ImageBroken className="h-[30%] w-[30%]" weight="light" aria-hidden="true" />
      </div>
    );
  }

  const optimized = stage === "optimized" ? optimizedSources(src, sizes) : null;
  if (optimized) {
    return (
      <img
        src={optimized.src}
        srcSet={optimized.srcSet}
        sizes={optimized.sizes}
        alt={alt}
        className={className}
        decoding="async"
        fetchPriority={fetchPriority}
        onError={() => setStage("raw")}
      />
    );
  }

  return (
    <img src={src} alt={alt} className={className} fetchPriority={fetchPriority} onError={() => setStage("broken")} />
  );
}
