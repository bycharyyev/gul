import type { MetadataRoute } from "next";

const SITE_URL = "https://gulyaly.pro";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing here is content a search result should ever land on -- an auth screen, a
      // logged-in cabinet, or a payment step is either useless to a stranger or actively
      // confusing indexed out of context.
      disallow: [
        "/account",
        "/login",
        "/register",
        "/forgot-password",
        "/chat",
        "/seller",
        "/payment",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
