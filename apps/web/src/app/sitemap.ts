import type { MetadataRoute } from "next";
import type { GalleryProductDto } from "@topup-hub/types";

const SITE_URL = "https://gulyaly.com";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gulyaly.com/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/gallery`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/cargo`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/track`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/become-seller`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Best-effort: a sitemap missing this round's new products is a rounding error a search
  // engine reconciles on its next crawl. A build or request failing because the API was briefly
  // unreachable is not an acceptable trade for that.
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/gallery/products`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const products = (await res.json()) as GalleryProductDto[];
      productRoutes = products
        .filter((p) => p.isEnabled)
        .map((p) => ({
          url: `${SITE_URL}/gallery/product/${p.id}`,
          changeFrequency: "weekly",
          priority: 0.7,
        }));
    }
  } catch {
    // handled above
  }

  return [...staticRoutes, ...productRoutes];
}
