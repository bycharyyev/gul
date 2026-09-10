"use client";

import { useEffect, useState } from "react";
import type { CargoBannerDto } from "@topup-hub/types";
import { api } from "@/lib/api";

/**
 * Ad slot at the top of the Cargo pages, filled from the admin console.
 *
 * Renders nothing at all when there is no active banner -- an empty placeholder box on a form
 * people use to spend money reads as a broken page, not as available inventory. Failure is silent
 * for the same reason: an ad that did not load is not worth an error message.
 */
export function CargoBanner() {
  const [banners, setBanners] = useState<CargoBannerDto[]>([]);

  useEffect(() => {
    api
      .listCargoBanners()
      .then(setBanners)
      .catch(() => setBanners([]));
  }, []);

  const banner = banners[0];
  if (!banner) return null;

  const content = (
    <>
      {/* Plain <img>: the URL is admin-supplied and can point at any CDN, which next/image would
          need configured per host. Fixed height + object-cover so an odd aspect ratio cannot
          push the form below the fold. */}
      <img
        src={banner.imageUrl}
        alt={banner.title}
        className="h-32 w-full object-cover sm:h-40"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900/70 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-center gap-1 p-5 text-white">
        <span className="text-lg font-bold drop-shadow">{banner.title}</span>
        {banner.subtitle && <span className="text-sm opacity-90 drop-shadow">{banner.subtitle}</span>}
      </div>
    </>
  );

  const className = "relative mb-6 block overflow-hidden rounded-xl2 shadow-soft";

  return banner.linkUrl ? (
    // Admin-supplied destination, so treat it as external: a new tab keeps a half-filled shipment
    // form alive, and noopener/noreferrer is the default posture for a link we do not control.
    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
