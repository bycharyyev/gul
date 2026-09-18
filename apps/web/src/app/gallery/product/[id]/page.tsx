import type { Metadata } from "next";
import type { GalleryProductDto } from "@topup-hub/types";
import { ProductView } from "./product-view";

const SITE_URL = "https://gulyaly.com";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gulyaly.com/api";

// Best-effort, same pattern as sitemap.ts: a slow or unreachable API degrades to generic
// metadata and no structured data, never a failed page load. The visible page (ProductView)
// fetches its own copy independently, so this never blocks or duplicates that render.
async function fetchProduct(id: string): Promise<GalleryProductDto | null> {
  try {
    const res = await fetch(`${API_URL}/gallery/products/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as GalleryProductDto;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) return {};

  const title = product.name;
  const description =
    product.description || `${product.name} — ${product.priceTmt} TMT. Заказ и доставка через Gulyaly.`;
  const url = `${SITE_URL}/gallery/product/${product.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      images: [{ url: product.imageUrl, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [product.imageUrl],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await fetchProduct(id);

  // Availability is binary in this catalog (no stock count), so InStock/OutOfStock is the
  // whole picture -- enabled products are always orderable on demand, there's no backorder or
  // preorder state to represent.
  const productJsonLd = product && {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.imageUrl,
    sku: product.sku,
    url: `${SITE_URL}/gallery/product/${product.id}`,
    ...(product.seller ? { brand: { "@type": "Brand", name: product.seller.shopName } } : {}),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/gallery/product/${product.id}`,
      priceCurrency: "TMT",
      price: product.priceTmt,
      availability: product.isEnabled
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      {productJsonLd && (
        <script
          type="application/ld+json"
          // Server-fetched from our own API, never user input -- safe to inline.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      <ProductView id={id} />
    </>
  );
}
