import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { SiteHeader, BottomNav } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CookieConsent } from "@/components/cookie-consent";
import { Providers } from "@/components/providers";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Gulyaly — пополнение мобильных операторов и сервисов",
  description:
    "Маркетплейс пополнения баланса мобильных операторов и цифровых сервисов. Быстро, безопасно, с прозрачным курсом.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body className="flex min-h-screen flex-col font-sans">
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
