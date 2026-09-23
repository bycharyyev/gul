"use client";

import { useState } from "react";
import { ImageBroken } from "@phosphor-icons/react/dist/ssr";

/**
 * A plain <img> that swaps to a soft placeholder instead of the browser's broken-image icon when
 * the URL 404s, times out, or was never set. Sources here are admin/seller-supplied (product
 * photos, avatars, story covers) and can go stale -- a deleted upload, a dead external CDN link --
 * with nothing on our side to catch it before render, so this is the one place that has to.
 *
 * className sizes and shapes the box either way (aspect ratio, rounding), so swapping to the
 * placeholder never reflows the layout around it.
 */
export function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(!src);

  if (broken) {
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

  return <img src={src ?? undefined} alt={alt} className={className} onError={() => setBroken(true)} />;
}
