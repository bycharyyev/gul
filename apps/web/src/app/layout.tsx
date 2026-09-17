import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { SiteHeader, BottomNav } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CookieConsent } from "@/components/cookie-consent";
import { Analytics } from "@/components/analytics";
import { SentryInit } from "@/components/sentry-init";
import { Providers } from "@/components/providers";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

const SITE_URL = "https://gulyaly.com";
const SITE_NAME = "Gulyaly";
const DESCRIPTION =
  "Маркетплейс пополнения баланса мобильных операторов и цифровых сервисов. Быстро, безопасно, с прозрачным курсом.";

export const metadata: Metadata = {
  // Turns every relative url below (and every page's own metadata) into an absolute one --
  // Open Graph/Twitter consumers fetch these from outside the site and can't resolve a relative
  // path the way a browser does.
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — пополнение мобильных операторов и сервисов`, template: `%s — ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — пополнение мобильных операторов и сервисов`,
    description: DESCRIPTION,
    images: [{ url: "/brand/gulyaly-logo-512.png", width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — пополнение мобильных операторов и сервисов`,
    description: DESCRIPTION,
    images: ["/brand/gulyaly-logo-512.png"],
  },
};

// Static and fully our own (no user input reaches it), so JSON.stringify into a script tag is
// safe here -- this isn't the general "don't dangerouslySetInnerHTML with untrusted data" case.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/brand/gulyaly-logo-512.png`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <SentryInit />
        <Analytics />
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <BottomNav />
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
