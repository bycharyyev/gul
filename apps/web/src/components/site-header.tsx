"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { House, Storefront, ChatCircle, User, SignIn, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import { LanguageSwitcher, useTranslation } from "@topup-hub/i18n";
import { api, isAuthenticated, API_ORIGIN } from "@/lib/api";

export function SiteHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const navLinks = [
    { href: "/", label: t("web.nav.home") },
    { href: "/feed", label: t("web.nav.feed") },
    { href: "/gallery", label: t("web.nav.gallery") },
    { href: "/cargo", label: t("web.nav.cargo") },
    { href: "/chat", label: t("web.nav.chat") },
  ];
  const [authed, setAuthed] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const isAuthed = isAuthenticated();
    setAuthed(isAuthed);
    if (isAuthed) {
      api
        .getMe()
        .then((me) => {
          setName(me.fullName || me.phone);
          setIsSeller(me.role === "SELLER");
          setAvatarUrl(me.avatarUrl);
        })
        .catch(() => {});
    }
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-black/30">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image
              would add a loader round-trip and layout machinery for no benefit here. */}
          <img src="/brand/gulyaly.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
          Gulyaly
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 sm:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand-600 dark:hover:text-brand-300">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden h-9 rounded-full border border-white/40 bg-white/40 px-2 text-xs font-medium text-slate-700 backdrop-blur hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 sm:inline-flex" />
          {isSeller && (
            <Link
              href="/seller"
              className="hidden rounded-full border border-white/40 bg-white/40 px-3.5 py-2 text-sm font-medium text-slate-700 backdrop-blur hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 sm:inline-flex"
            >
              {t("web.nav.sellerCabinet")}
            </Link>
          )}
          <Link
            href={authed ? "/account" : "/login"}
            aria-label={authed ? name || t("web.account.title") : t("web.nav.login")}
            className="flex h-10 items-center gap-2 rounded-full border border-white/40 bg-white/40 px-2.5 text-sm font-medium text-slate-700 backdrop-blur hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-brand text-white">
              {authed && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary origin/size, not worth next/image here
                <img src={`${API_ORIGIN}${avatarUrl}`} alt="" className="h-full w-full object-cover" />
              ) : authed ? (
                <User size={16} weight="bold" aria-hidden="true" />
              ) : (
                <SignIn size={16} weight="bold" aria-hidden="true" />
              )}
            </span>
            {authed && name && <span className="hidden max-w-[120px] truncate sm:inline">{name}</span>}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, [pathname]);

  const items = [
    { href: "/", label: t("web.nav.home"), icon: House, active: pathname === "/" },
    { href: "/feed", label: t("web.nav.feed"), icon: PlayCircle, active: pathname === "/feed" },
    { href: "/gallery", label: t("web.nav.gallery"), icon: Storefront, active: pathname === "/gallery" },
    { href: "/chat", label: t("web.nav.chat"), icon: ChatCircle, active: pathname === "/chat" },
    {
      href: authed ? "/account" : "/login",
      label: t("web.nav.profile"),
      icon: User,
      active: pathname === "/account" || pathname === "/login",
    },
  ];

  return (
    <nav
      aria-label={t("web.nav.mainNav")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-black/40 sm:hidden"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
                item.active ? "text-brand-600 dark:text-brand-300" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Icon size={22} weight={item.active ? "fill" : "regular"} aria-hidden="true" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
