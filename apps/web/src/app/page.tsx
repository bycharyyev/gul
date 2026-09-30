import type { HomeSlideDetailDto } from "@topup-hub/types";
import { HomePage } from "./home-page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gulyaly.com/api";

// The hero slide is the page's largest element. Fetched in the browser, its image could only start
// loading after HTML -> JS bundles -> hydration -> the API call (mobile LCP 6-7s even though the
// image itself takes ~40ms). Fetched here, the <img> and its srcset are in the HTML and the browser
// starts on it immediately. Slides are the same for every visitor (no locale, no user), so the
// page is regenerated at most once a minute rather than per request.
export const revalidate = 60;

// Best-effort, same pattern as gallery/product/[id]/page.tsx: an unreachable API yields null and
// the carousel fetches its own copy in the browser, as it did before -- never a failed page.
async function fetchSlides(): Promise<HomeSlideDetailDto[] | null> {
  try {
    // Bounded: this runs while the page is prerendered at build and regenerated on the server,
    // and a hung API must not hold either up.
    const res = await fetch(`${API_URL}/home-slides`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HomeSlideDetailDto[];
  } catch {
    return null;
  }
}

export default async function Page() {
  return <HomePage initialSlides={await fetchSlides()} />;
}
