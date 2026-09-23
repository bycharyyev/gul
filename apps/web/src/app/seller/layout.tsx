"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const tabs = [
    { href: "/seller", label: t("seller.nav.overview") },
    { href: "/seller/analytics", label: t("seller.nav.analytics") },
    { href: "/seller/products", label: t("seller.nav.products") },
    { href: "/seller/storefronts", label: t("seller.nav.storefronts") },
    { href: "/seller/orders", label: t("seller.nav.orders") },
    { href: "/seller/chat", label: t("seller.nav.chat") },
    { href: "/seller/ads", label: t("seller.nav.ads") },
    { href: "/seller/api-keys", label: t("seller.nav.apiKeys") },
    { href: "/seller/api-docs", label: t("seller.nav.apiDocs") },
    { href: "/seller/shop", label: t("seller.nav.shop") },
  ];

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .getMe()
      .then((me) => {
        if (me.role !== "SELLER") {
          router.push("/");
          return;
        }
        setAllowed(true);
      })
      .catch(() => router.push("/login"))
      .finally(() => setChecked(true));
  }, [router]);

  if (!checked || !allowed) {
    return <div className="mx-auto max-w-5xl px-4 py-12 text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("seller.cabinetTitle")}</h1>
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl2 border border-white/40 bg-white/50 p-1 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium ${
              pathname === tab.href
                ? "bg-gradient-brand text-white"
                : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
