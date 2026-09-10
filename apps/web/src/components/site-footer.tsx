"use client";

import Link from "next/link";
import { useTranslation } from "@topup-hub/i18n";
import { SocialIcons } from "@/components/social-icons";

export function SiteFooter() {
  const { t } = useTranslation();

  const footerLinks = [
    { href: "/track", label: t("web.footer.trackOrder") },
    { href: "/pages/faq", label: t("web.footer.faq") },
    { href: "/become-seller", label: t("web.footer.becomeSeller") },
    { href: "/pages/privacy", label: t("web.footer.privacy") },
    { href: "/pages/offer", label: t("web.footer.offer") },
  ];

  return (
    <footer className="border-t border-slate-200/70 pb-24 pt-8 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400 sm:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("web.footer.copyright", { year: new Date().getFullYear() })}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand-600 dark:hover:text-brand-300">
              {link.label}
            </Link>
          ))}
        </nav>
        <SocialIcons />
      </div>
    </footer>
  );
}
