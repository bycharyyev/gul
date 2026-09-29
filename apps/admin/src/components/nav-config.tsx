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
  Link2,
  FileText,
  MessageCircle,
  Mail,
  Code2,
  KeyRound,
  Users,
  Contact,
  Database,
  Activity,
  BarChart3,
  Bell,
  Gift,
  Container,
  Network,
  UserPlus,
  Banknote,
  ShoppingBag,
  ShieldCheck,
  MessagesSquare,
  Scale,
  Gauge,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@topup-hub/i18n";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// The console grew to 33 sections in one flat list. Grouped by the job someone opens it for,
// so an operator scanning for "withdrawals" looks in one short group instead of the whole column.
export function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  return [
    {
      id: "overview",
      label: t("admin.navGroup.overview"),
      items: [
        { to: "/", label: t("admin.nav.dashboard"), icon: LayoutDashboard },
        { to: "/economics", label: t("admin.nav.economics"), icon: PieChart },
        { to: "/analytics", label: t("admin.nav.analytics"), icon: BarChart3 },
      ],
    },
    {
      id: "sales",
      label: t("admin.navGroup.sales"),
      items: [
        { to: "/orders", label: t("admin.nav.orders"), icon: ShoppingCart },
        { to: "/catalog", label: t("admin.nav.catalog"), icon: Package },
        { to: "/payment-reconciliation", label: t("admin.nav.paymentReconciliation"), icon: Scale },
      ],
    },
    {
      id: "marketplace",
      label: t("admin.navGroup.marketplace"),
      items: [
        { to: "/gallery", label: t("admin.nav.gallery"), icon: Flower2 },
        { to: "/gallery-orders", label: t("admin.nav.galleryOrders"), icon: Truck },
        { to: "/sellers", label: t("admin.nav.sellers"), icon: Store },
        { to: "/seller-applications", label: t("admin.nav.sellerApplications"), icon: UserPlus },
        { to: "/withdrawals", label: t("admin.nav.withdrawals"), icon: Banknote },
        { to: "/seller-ledger", label: t("admin.nav.sellerLedger"), icon: Banknote },
      ],
    },
    {
      id: "cargo",
      label: t("admin.navGroup.cargo"),
      items: [
        { to: "/cargo", label: t("admin.nav.cargo"), icon: Container },
        { to: "/cargo/purchases/review", label: t("admin.nav.marketplacePurchases"), icon: ShoppingBag },
      ],
    },
    {
      id: "customers",
      label: t("admin.navGroup.customers"),
      items: [
        { to: "/users", label: t("admin.nav.customers"), icon: Contact },
        { to: "/support", label: t("admin.nav.support"), icon: MessageCircle },
        { to: "/chats", label: t("admin.nav.chats"), icon: MessagesSquare },
        { to: "/referrals", label: t("admin.nav.referrals"), icon: Gift },
      ],
    },
    {
      id: "content",
      label: t("admin.navGroup.content"),
      items: [
        { to: "/home-slides", label: t("admin.nav.homeSlides"), icon: GalleryHorizontal },
        { to: "/stories", label: t("admin.nav.stories"), icon: Sparkles },
        { to: "/feed/moderation", label: t("admin.nav.feedModeration"), icon: ShieldCheck },
        { to: "/content-pages", label: t("admin.nav.contentPages"), icon: FileText },
        { to: "/social-links", label: t("admin.nav.socialLinks"), icon: Share2 },
        { to: "/managed-links", label: t("admin.nav.managedLinks"), icon: Link2 },
      ],
    },
    {
      id: "messaging",
      label: t("admin.navGroup.messaging"),
      items: [
        { to: "/notifications", label: t("admin.nav.notifications"), icon: Bell },
        { to: "/mail", label: t("admin.nav.mail"), icon: Mail },
        { to: "/mail/templates", label: t("admin.nav.mailTemplates"), icon: Mail },
      ],
    },
    {
      id: "developers",
      label: t("admin.navGroup.developers"),
      items: [
        { to: "/api-management", label: t("admin.nav.apiManagement"), icon: Code2 },
        { to: "/api-keys", label: t("admin.nav.apiKeys"), icon: KeyRound },
        { to: "/api-usage", label: t("admin.nav.apiUsage"), icon: Activity },
      ],
    },
    {
      id: "system",
      label: t("admin.navGroup.system"),
      items: [
        { to: "/team", label: t("admin.nav.team"), icon: Users },
        { to: "/database", label: t("admin.nav.database"), icon: Database },
        { to: "/monitoring", label: t("admin.nav.monitoring"), icon: Gauge },
        { to: "/subdomains", label: t("admin.nav.subdomains"), icon: Network },
      ],
    },
  ];
}
