import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Flower2,
  Truck,
  Store,
  Sparkles,
  GalleryHorizontal,
  Share2,
  FileText,
  MessageCircle,
  Mail,
  Code2,
  KeyRound,
  Users,
  Contact,
  Database,
  Activity,
  Gift,
  Container,
  Network,
  UserCircle,
  LogOut,
  UserPlus,
  Banknote,
  ShoppingBag,
  ShieldCheck,
  type LucideIcon,
  MessagesSquare,
} from "lucide-react";
import { LanguageSwitcher, useTranslation } from "@topup-hub/i18n";
import { api, getCurrentUser, USER_UPDATED_EVENT } from "@/lib/api";
import { NotificationProvider, useNotifications } from "@/lib/notifications-context";

function useNavItems(): { to: string; label: string; icon: LucideIcon }[] {
  const { t } = useTranslation();
  return [
    { to: "/", label: t("admin.nav.dashboard"), icon: LayoutDashboard },
    { to: "/orders", label: t("admin.nav.orders"), icon: ShoppingCart },
    { to: "/catalog", label: t("admin.nav.catalog"), icon: Package },
    { to: "/gallery", label: t("admin.nav.gallery"), icon: Flower2 },
    { to: "/gallery-orders", label: t("admin.nav.galleryOrders"), icon: Truck },
    { to: "/feed/moderation", label: t("admin.nav.feedModeration"), icon: ShieldCheck },
    { to: "/chats", label: t("admin.nav.chats"), icon: MessagesSquare },
    { to: "/sellers", label: t("admin.nav.sellers"), icon: Store },
    { to: "/seller-applications", label: t("admin.nav.sellerApplications"), icon: UserPlus },
    { to: "/withdrawals", label: t("admin.nav.withdrawals"), icon: Banknote },
    { to: "/seller-ledger", label: t("admin.nav.sellerLedger"), icon: Banknote },
    { to: "/payment-reconciliation", label: t("admin.nav.paymentReconciliation"), icon: Activity },
    { to: "/home-slides", label: t("admin.nav.homeSlides"), icon: GalleryHorizontal },
    { to: "/stories", label: t("admin.nav.stories"), icon: Sparkles },
    { to: "/social-links", label: t("admin.nav.socialLinks"), icon: Share2 },
    { to: "/content-pages", label: t("admin.nav.contentPages"), icon: FileText },
    { to: "/support", label: t("admin.nav.support"), icon: MessageCircle },
    { to: "/mail", label: t("admin.nav.mail"), icon: Mail },
    { to: "/mail/templates", label: t("admin.nav.mailTemplates"), icon: Mail },
    { to: "/api-management", label: t("admin.nav.apiManagement"), icon: Code2 },
    { to: "/api-keys", label: t("admin.nav.apiKeys"), icon: KeyRound },
    { to: "/api-usage", label: t("admin.nav.apiUsage"), icon: Activity },
    { to: "/users", label: t("admin.nav.customers"), icon: Contact },
    { to: "/team", label: t("admin.nav.team"), icon: Users },
    { to: "/database", label: t("admin.nav.database"), icon: Database },
    { to: "/monitoring", label: t("admin.nav.monitoring"), icon: Activity },
    { to: "/referrals", label: t("admin.nav.referrals"), icon: Gift },
    { to: "/cargo", label: t("admin.nav.cargo"), icon: Container },
    { to: "/cargo/purchases/review", label: t("admin.nav.marketplacePurchases"), icon: ShoppingBag },
    { to: "/subdomains", label: t("admin.nav.subdomains"), icon: Network },
  ];
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <LayoutChrome>{children}</LayoutChrome>
    </NotificationProvider>
  );
}

function NavBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function LayoutChrome({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navItems = useNavItems();
  const navigate = useNavigate();
  const [user, setUser] = useState(getCurrentUser());
  const { pendingOrdersCount, unreadChatCount } = useNotifications();

  useEffect(() => {
    const onUserUpdated = () => setUser(getCurrentUser());
    window.addEventListener(USER_UPDATED_EVENT, onUserUpdated);
    return () => window.removeEventListener(USER_UPDATED_EVENT, onUserUpdated);
  }, []);

  function logout() {
    api.logout();
    navigate("/login");
  }

  function badgeFor(to: string) {
    if (to === "/orders") return pendingOrdersCount;
    if (to === "/support") return unreadChatCount;
    return 0;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2 text-lg font-extrabold">
          <img src="/brand/gulyaly.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
          <span className="text-gradient">Gulyaly</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-gradient-brand-soft text-brand-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
              <NavBadge count={badgeFor(item.to)} />
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 pt-3">
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? "bg-gradient-brand-soft text-brand-700" : "text-slate-600 hover:bg-slate-50"
              }`
            }
          >
            <UserCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {user?.fullName || user?.phone || t("admin.nav.myAccount")}
          </NavLink>
          <button
            onClick={logout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("admin.nav.logout")}
          </button>
          <LanguageSwitcher className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600" />
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 p-8">{children}</main>
    </div>
  );
}
