import { Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/order-detail";
import CatalogPage from "@/pages/catalog";
import GalleryPage from "@/pages/gallery";
import GalleryOrdersPage from "@/pages/gallery-orders";
import SellersPage from "@/pages/sellers";
import SellerApplicationsPage from "@/pages/seller-applications";
import WithdrawalsPage from "@/pages/withdrawals";
import StoriesPage from "@/pages/stories";
import HomeSlidesPage from "@/pages/home-slides";
import SocialLinksPage from "@/pages/social-links";
import ContentPagesPage from "@/pages/content-pages";
import SupportPage from "@/pages/support";
import MailPage from "@/pages/mail";
import MailTemplatesPage from "@/pages/mail-templates";
import ApiManagementPage from "@/pages/api-management";
import ApiKeysPage from "@/pages/api-keys";
import ApiUsagePage from "@/pages/api-usage";
import TeamPage from "@/pages/team";
import UsersPage from "@/pages/users";
import DatabasePage from "@/pages/database";
import MonitoringPage from "@/pages/monitoring";
import ReferralsPage from "@/pages/referrals";
import CargoPage from "@/pages/cargo";
import CargoShipmentDetailPage from "@/pages/cargo-shipment-detail";
import SubdomainsPage from "@/pages/subdomains";
import AccountPage from "@/pages/account";
import SellerLedgerPage from "@/pages/seller-ledger";
import PaymentReconciliationPage from "@/pages/payment-reconciliation";
import MarketplacePurchaseSettingsPage from "@/pages/marketplace-purchase-settings";
import { MarketplacePurchaseListPage } from "@/pages/marketplace-purchase-list";
import MarketplacePurchaseDetailPage from "@/pages/marketplace-purchase-detail";
import ChatRoomsPage from "@/pages/chat-rooms";
import FeedModerationPage from "@/pages/feed-moderation";
import { ProtectedRoute } from "@/components/protected-route";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/chats" element={<ProtectedRoute><ChatRoomsPage /></ProtectedRoute>} />
      <Route path="/feed/moderation" element={<ProtectedRoute><FeedModerationPage /></ProtectedRoute>} />
      <Route path="/cargo/purchases/review" element={<ProtectedRoute><MarketplacePurchaseListPage review /></ProtectedRoute>} />
      <Route path="/cargo/purchases/orders" element={<ProtectedRoute><MarketplacePurchaseListPage /></ProtectedRoute>} />
      <Route path="/cargo/purchases/orders/:id" element={<ProtectedRoute><MarketplacePurchaseDetailPage /></ProtectedRoute>} />
      <Route path="/cargo/purchases/settings" element={<ProtectedRoute><MarketplacePurchaseSettingsPage /></ProtectedRoute>} />
      <Route
        path="/payment-reconciliation"
        element={
          <ProtectedRoute>
            <PaymentReconciliationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/seller-ledger"
        element={
          <ProtectedRoute>
            <SellerLedgerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute>
            <OrderDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalog"
        element={
          <ProtectedRoute>
            <CatalogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gallery"
        element={
          <ProtectedRoute>
            <GalleryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gallery-orders"
        element={
          <ProtectedRoute>
            <GalleryOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sellers"
        element={
          <ProtectedRoute>
            <SellersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/seller-applications"
        element={
          <ProtectedRoute>
            <SellerApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/withdrawals"
        element={
          <ProtectedRoute>
            <WithdrawalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stories"
        element={
          <ProtectedRoute>
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home-slides"
        element={
          <ProtectedRoute>
            <HomeSlidesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/social-links"
        element={
          <ProtectedRoute>
            <SocialLinksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/content-pages"
        element={
          <ProtectedRoute>
            <ContentPagesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <SupportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mail"
        element={
          <ProtectedRoute>
            <MailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mail/templates"
        element={
          <ProtectedRoute>
            <MailTemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-management"
        element={
          <ProtectedRoute>
            <ApiManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute>
            <ApiKeysPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-usage"
        element={
          <ProtectedRoute>
            <ApiUsagePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/database"
        element={
          <ProtectedRoute>
            <DatabasePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitoring"
        element={
          <ProtectedRoute>
            <MonitoringPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/referrals"
        element={
          <ProtectedRoute>
            <ReferralsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cargo"
        element={
          <ProtectedRoute>
            <CargoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cargo/:id"
        element={
          <ProtectedRoute>
            <CargoShipmentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subdomains"
        element={
          <ProtectedRoute>
            <SubdomainsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
