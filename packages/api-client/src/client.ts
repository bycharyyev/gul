import type {
  ChatInboxEntryDto,
  ChatOfficialCategory,
  ChatConversationDto,
  ChatMessageDto,
  ChatChannelDto,
  ChatGroupInfoDto,
  ChatRoomAdminDto,
  CreateChatRoomInput,
  AdminContentPageInput,
  AdminHomeSlideInput,
  AdminServiceInput,
  AdminSocialLinkInput,
  AdminStatsDto,
  AdminStoryInput,
  AdPricingDto,
  ApiKeyDto,
  AuthResponse,
  ChangePasswordInput,
  ContentPageDto,
  CreateApiKeyInput,
  CreateApiKeyResult,
  CreateOrderInput,
  CreateSellerApiKeyInput,
  CreateSellerApiKeyResult,
  CreateSellerApplicationInput,
  CreateSellerInput,
  CreateSlideAdInput,
  CreateStaffUserInput,
  CreateStoryAdInput,
  CreateWithdrawalInput,
  CustomerDetailDto,
  CustomerDto,
  CustomerStatsDto,
  DocumentDto,
  AdminGalleryCategoryInput,
  AdminGalleryProductInput,
  CreateGalleryOrderInput,
  ApiUsageDto,
  DatabaseTableStatDto,
  EmailLogDto,
  EmailSettingsDto,
  GalleryCategoryDto,
  GalleryOrderAdminDto,
  GalleryOrderDto,
  GalleryProductDto,
  HomeSlideDetailDto,
  LoginInput,
  ReviewApplicationInput,
  ReviewWithdrawalInput,
  SellerAdminDto,
  SellerApiKeyDto,
  SellerApplicationAdminDto,
  SellerApplicationDto,
  SellerApplicationStatus,
  SellerDto,
  StorefrontDto,
  UpsertStorefrontInput,
  SellerGalleryProductInput,
  SellerMeDto,
  SellerStatsDto,
  SellerTelegramStatusDto,
  SellerTelegramLinkCodeDto,
  SellerTimeseriesPoint,
  SellerTopProductDto,
  OrderDetailDto,
  OrderDto,
  OrdersTimeseriesPoint,
  CreateSubdomainInput,
  ManagedSubdomainDto,
  PaymentMethodDto,
  PaymentInitiationDto,
  PaymentReconciliationDto,
  RateDto,
  ReferralLedgerEntryDto,
  ReferralLeaderboardEntryDto,
  ReferralSettingsDto,
  RegisterInput,
  SendMarketingEmailInput,
  SendMarketingEmailResult,
  SendSupportMessageInput,
  SendTestEmailInput,
  ServiceDto,
  SessionDto,
  EmailStatusDto,
  EmailTemplateDto,
  EmailKindSpecDto,
  EmailTemplatePreviewDto,
  SaveEmailTemplateInput,
  EmailPreferenceDto,
  EmailSuppressionDto,
  EmailOutboxRowDto,
  EmailHealthDto,
  SetDeliveryNoteInput,
  SocialLinkDto,
  StaffUserDto,
  StoryDetailDto,
  SupportMessageDto,
  SupportThreadWithMessagesDto,
  SupportThreadWithUnreadDto,
  TrackedOrderDto,
  TrackOrderInput,
  UpdateEmailSettingsInput,
  UpdateGalleryOrderStatusInput,
  UpdateMeInput,
  LocaleInput,
  UpdateOrderDetailsInput,
  UpdateOrderStatusInput,
  UpdateReferralSettingsInput,
  UpdateSellerInput,
  UpdateThreadStatusInput,
  UpdateUserInput,
  UpdateUsernameInput,
  MyReferralInfoDto,
  UpsertRateInput,
  WithdrawalRequestAdminDto,
  WithdrawalRequestDto,
  WithdrawalStatus,
  SellerLedgerEntryDto,
  SellerBalanceMismatchDto,
  CargoBannerAdminDto,
  CargoBannerDto,
  CargoCityDto,
  CargoDirectionsDto,
  CargoItemTypeAdminDto,
  CargoQuoteDto,
  CreateQuoteInput,
  CreateShipmentInput,
  CreatePickupRequestInput,
  ShipmentDto,
  ShipmentListResponseDto,
  PublicTrackingDto,
  CreateCityInput,
  UpdateCityInput,
  UpsertBannerInput,
  UpsertItemTypeInput,
  SetTariffBracketsInput,
  CargoExchangeRateDto,
  UpdateExchangeRateInput,
  UpdateShipmentStatusInput,
  CreateSocialPostInput,
  UpdateSocialPostInput,
  CreateSocialCommentInput,
  ReportSocialPostInput,
  ModerateSocialPostInput,
  ModerateSocialCommentInput,
  SocialFeedPageDto,
  SocialFeedPostDto,
} from "@topup-hub/types";
import { CargoResource } from "./resources/cargo.js";
import { AuthResource } from "./resources/auth.js";

/**
 * Nest returns a validation failure as an *array* of messages, not a string. Reading it as a
 * string produced "first,second" -- comma-joined with no space, and untranslatable, since
 * translateError matches on the whole message. Join readably and keep each message intact so a
 * dictionary lookup on a single-message error still works.
 */
function toMessage(raw: unknown, fallback: string): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(". ");
  return fallback;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(accessToken: string, refreshToken: string): void;
  clear(): void;
}

/** In-memory token store — web/mobile apps supply their own (localStorage, SecureStore, cookies, ...). */
export class MemoryTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;
  getAccessToken() {
    return this.access;
  }
  getRefreshToken() {
    return this.refresh;
  }
  setTokens(accessToken: string, refreshToken: string) {
    this.access = accessToken;
    this.refresh = refreshToken;
  }
  clear() {
    this.access = null;
    this.refresh = null;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore?: TokenStore;
  /** Called when the access token is invalid/expired and refreshing also failed — apps should redirect to login. */
  onSessionExpired?: () => void;
}

/**
 * Thin typed fetch wrapper over the REST API. Shared across web (Next.js),
 * admin (Vite/React) and the future React Native app — only the TokenStore
 * implementation differs per platform.
 */
export class ApiClient {
  private baseUrl: string;
  private tokenStore: TokenStore;
  private onSessionExpired?: () => void;
  private refreshPromise: Promise<boolean> | null = null;
  readonly cargo: CargoResource;
  readonly auth: AuthResource;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokenStore = options.tokenStore ?? new MemoryTokenStore();
    this.onSessionExpired = options.onSessionExpired;
    this.cargo = new CargoResource((path, init) => this.request(path, init));
    this.auth = new AuthResource(
      (path, init) => this.request(path, init),
      this.tokenStore,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit & { auth?: boolean } = {},
    isRetry = false,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    // A FormData body (file upload) must NOT get a JSON Content-Type — the browser sets
    // its own `multipart/form-data; boundary=...` when it serializes the FormData.
    const isFormData =
      typeof FormData !== "undefined" && init.body instanceof FormData;
    if (!isFormData) {
      headers.set("Content-Type", "application/json");
    }

    const useAuth = init.auth !== false;
    if (useAuth) {
      const token = this.tokenStore.getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && useAuth && !isRetry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(path, init, true);
      this.tokenStore.clear();
      this.onSessionExpired?.();
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: unknown;
        requestId?: string;
      };
      throw new ApiError(
        res.status,
        body.code ?? "UNKNOWN",
        toMessage(body.message, res.statusText),
        body.requestId,
      );
    }

    // Don't rely on every endpoint remembering to set exactly 204 for an empty response --
    // several (e.g. POST /admin/mail/test) return the Nest default 201 with no body. Parsing
    // JSON from an empty string throws, which every caller was seeing as a false "request
    // failed" even though the request genuinely succeeded server-side.
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  /** Single-flight refresh so concurrent 401s don't each fire their own /auth/refresh call. */
  private tryRefresh(): Promise<boolean> {
    const refreshToken = this.tokenStore.getRefreshToken();
    if (!refreshToken) return Promise.resolve(false);

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const res = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
          if (!res.ok) return false;
          const data = (await res.json()) as AuthResponse;
          this.tokenStore.setTokens(data.accessToken, data.refreshToken);
          return true;
        } catch {
          return false;
        }
      })().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  // ---- Catalog (public) ----
  listServices() {
    return this.request<ServiceDto[]>("/catalog/services", { auth: false });
  }

  listRates(serviceId: string) {
    return this.request<RateDto[]>(`/catalog/services/${serviceId}/rates`, {
      auth: false,
    });
  }

  listPaymentMethods() {
    return this.request<PaymentMethodDto[]>("/catalog/payment-methods", {
      auth: false,
    });
  }

  // ---- Orders ----
  createOrder(input: CreateOrderInput) {
    return this.request<OrderDto>("/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getOrder(id: string) {
    return this.request<OrderDetailDto>(`/orders/${id}`);
  }

  listMyOrders() {
    return this.request<OrderDto[]>("/orders/me");
  }

  // ---- Admin: orders ----
  listAllOrders(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<OrderDetailDto[]>(`/orders${qs}`);
  }

  updateOrderStatus(id: string, input: UpdateOrderStatusInput) {
    return this.request<OrderDto>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  retryOrderTopup(id: string) {
    return this.request<void>(`/orders/${id}/retry-topup`, { method: "POST" });
  }

  setOrderDeliveryNote(id: string, input: SetDeliveryNoteInput) {
    return this.request<OrderDto>(`/orders/${id}/delivery-note`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  updateOrderDetails(id: string, input: UpdateOrderDetailsInput) {
    return this.request<OrderDto>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  confirmOrderPayment(orderId: string, reason: string) {
    return this.request<{ alreadyProcessed: boolean; requiresRefund: boolean }>(
      `/payments/orders/${orderId}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  }

  initiateOrderPayment(orderId: string, idempotencyKey: string) {
    return this.request<PaymentInitiationDto>(
      `/payments/orders/${orderId}/initiate`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  }

  reconcilePayments(minutes = 15) {
    return this.request<PaymentReconciliationDto[]>(
      `/payments/reconciliation?minutes=${encodeURIComponent(minutes)}`,
    );
  }

  runPaymentReconciliation(minutes = 15) {
    return this.request<PaymentReconciliationDto[]>(
      `/payments/reconciliation/run?minutes=${encodeURIComponent(minutes)}`,
      { method: "POST" },
    );
  }

  // ---- Admin: catalog ----
  listAllServices() {
    return this.request<ServiceDto[]>("/catalog/admin/services");
  }

  createService(input: AdminServiceInput) {
    return this.request<ServiceDto>("/catalog/admin/services", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateService(id: string, input: Partial<AdminServiceInput>) {
    return this.request<ServiceDto>(`/catalog/admin/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteService(id: string) {
    return this.request<void>(`/catalog/admin/services/${id}`, {
      method: "DELETE",
    });
  }

  upsertRate(serviceId: string, input: UpsertRateInput) {
    return this.request<RateDto>(`/catalog/admin/services/${serviceId}/rates`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Auth compatibility aliases. Prefer api.auth.* in new code. ----
  register(input: RegisterInput) {
    return this.auth.register(input);
  }
  login(input: LoginInput) {
    return this.auth.login(input);
  }
  logout() {
    return this.auth.logout();
  }
  getMe() {
    return this.auth.getMe();
  }
  updateMe(input: UpdateMeInput) {
    return this.auth.updateMe(input);
  }
  updateLocale(locale: LocaleInput) {
    return this.auth.updateLocale(locale);
  }
  changePassword(input: ChangePasswordInput) {
    return this.auth.changePassword(input);
  }
  listSessions() {
    return this.auth.listSessions();
  }
  revokeSession(id: string) {
    return this.auth.revokeSession(id);
  }
  logoutAllSessions() {
    return this.auth.logoutAllSessions();
  }
  requestPasswordReset(email: string) {
    return this.auth.requestPasswordReset(email);
  }
  confirmPasswordReset(input: {
    email: string;
    code: string;
    newPassword: string;
  }) {
    return this.auth.confirmPasswordReset(input);
  }
  getEmailStatus() {
    return this.auth.getEmailStatus();
  }
  requestEmailVerification(email: string) {
    return this.auth.requestEmailVerification(email);
  }
  confirmEmailVerification(code: string) {
    return this.auth.confirmEmailVerification(code);
  }

  // ---- Admin: email templates ----

  listEmailTemplates(
    filter: { kind?: string; locale?: string; status?: string } = {},
  ) {
    const query = new URLSearchParams(
      Object.entries(filter).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    return this.request<EmailTemplateDto[]>(
      `/admin/mail/templates${query ? `?${query}` : ""}`,
    );
  }

  listEmailKinds() {
    return this.request<EmailKindSpecDto[]>("/admin/mail/templates/kinds");
  }

  getEmailTemplate(id: string) {
    return this.request<EmailTemplateDto>(`/admin/mail/templates/${id}`);
  }

  previewEmailTemplate(id: string) {
    return this.request<EmailTemplatePreviewDto>(
      `/admin/mail/templates/${id}/preview`,
    );
  }

  saveEmailTemplate(input: SaveEmailTemplateInput) {
    return this.request<EmailTemplateDto>("/admin/mail/templates", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  activateEmailTemplate(id: string) {
    return this.request<EmailTemplateDto>(
      `/admin/mail/templates/${id}/activate`,
      { method: "POST" },
    );
  }

  archiveEmailTemplate(id: string) {
    return this.request<EmailTemplateDto>(
      `/admin/mail/templates/${id}/archive`,
      { method: "POST" },
    );
  }

  // ---- Email preferences (the logged-in user's own) ----

  getEmailPreferences() {
    return this.request<EmailPreferenceDto>("/account/email/preferences");
  }

  updateEmailPreferences(input: Partial<EmailPreferenceDto>) {
    return this.request<EmailPreferenceDto>("/account/email/preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Admin: mail operations ----

  getMailHealth() {
    return this.request<EmailHealthDto>("/admin/mail/health");
  }

  listEmailSuppressions(reason?: string) {
    return this.request<EmailSuppressionDto[]>(
      `/admin/mail/suppressions${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`,
    );
  }

  addEmailSuppression(input: { email: string; reason: string; note?: string }) {
    return this.request<EmailSuppressionDto>("/admin/mail/suppressions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  removeEmailSuppression(email: string) {
    return this.request<{ email: string; removed: boolean }>(
      `/admin/mail/suppressions/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
  }

  listFailedOutbox() {
    return this.request<EmailOutboxRowDto[]>("/admin/mail/outbox/failed");
  }

  retryOutbox(id: string) {
    return this.request<EmailOutboxRowDto>(`/admin/mail/outbox/${id}/retry`, {
      method: "POST",
    });
  }

  // ---- Referrals ----

  getMyReferralInfo() {
    return this.request<MyReferralInfoDto>("/referrals/me");
  }

  /** Staff-only, and deliberately so: a referral code is what invitations already in circulation
   *  point at, so rewriting one is a decision about other people's links, not a personal setting.
   *  The backend audits every call. */
  adminChangeUsername(userId: string, input: UpdateUsernameInput) {
    return this.request<{ username: string }>(
      `/admin/referrals/users/${encodeURIComponent(userId)}/username`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }

  getReferralSettings() {
    return this.request<ReferralSettingsDto>("/admin/referrals/settings");
  }

  updateReferralSettings(input: UpdateReferralSettingsInput) {
    return this.request<ReferralSettingsDto>("/admin/referrals/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  listReferralLedger() {
    return this.request<ReferralLedgerEntryDto[]>("/admin/referrals/ledger");
  }

  getReferralLeaderboard(range: { from: string; to: string }) {
    return this.request<ReferralLeaderboardEntryDto[]>(
      `/admin/referrals/leaderboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    );
  }

  // ---- Admin: subdomains ----
  listSubdomains() {
    return this.request<ManagedSubdomainDto[]>("/admin/subdomains");
  }

  createSubdomain(input: CreateSubdomainInput) {
    return this.request<ManagedSubdomainDto>("/admin/subdomains", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteSubdomain(id: string) {
    return this.request<void>(`/admin/subdomains/${id}`, { method: "DELETE" });
  }

  // ---- Admin: staff/users ----
  listStaff() {
    return this.request<StaffUserDto[]>("/users");
  }

  createStaffUser(input: CreateStaffUserInput) {
    return this.request<StaffUserDto>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateStaffUser(id: string, input: UpdateUserInput) {
    return this.request<StaffUserDto>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteStaffUser(id: string) {
    return this.request<void>(`/users/${id}`, { method: "DELETE" });
  }

  // ---- Admin: customers ----
  listCustomers(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<CustomerDto[]>(`/users/customers${qs}`);
  }

  getCustomerStats() {
    return this.request<CustomerStatsDto>("/users/customers/stats");
  }

  getCustomerDetail(id: string) {
    return this.request<CustomerDetailDto>(`/users/customers/${id}`);
  }

  // ---- Admin: stats ----
  getAdminStats() {
    return this.request<AdminStatsDto>("/admin/stats");
  }

  getOrdersTimeseries(days = 30) {
    return this.request<OrdersTimeseriesPoint[]>(
      `/admin/stats/orders-timeseries?days=${days}`,
    );
  }

  getDatabaseOverview() {
    return this.request<DatabaseTableStatDto[]>("/admin/stats/database");
  }

  /** Request counts, failures and average latency for the last `days` days (max 35). */
  getApiUsage(days = 7) {
    return this.request<ApiUsageDto>(`/admin/api-usage?days=${days}`);
  }

  // ---- Admin: API keys ----
  listApiKeys() {
    return this.request<ApiKeyDto[]>("/admin/api-keys");
  }

  createApiKey(input: CreateApiKeyInput) {
    return this.request<CreateApiKeyResult>("/admin/api-keys", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  setApiKeyEnabled(id: string, isEnabled: boolean) {
    return this.request<ApiKeyDto>(`/admin/api-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled }),
    });
  }

  /** `null` returns the key to the partner tier default. There is no "unlimited". */
  setApiKeyRateLimit(id: string, rateLimitPerMin: number | null) {
    return this.request<ApiKeyDto>(`/admin/api-keys/${id}/rate-limit`, {
      method: "PATCH",
      body: JSON.stringify({ rateLimitPerMin }),
    });
  }

  /** Replaces the scope list outright -- scopes restrict, so there is no additive form. */
  setApiKeyScopes(id: string, scopes: string[]) {
    return this.request<ApiKeyDto>(`/admin/api-keys/${id}/scopes`, {
      method: "PATCH",
      body: JSON.stringify({ scopes }),
    });
  }

  /** ISO date, or `null` for "never expires". */
  setApiKeyExpiry(id: string, expiresAt: string | null) {
    return this.request<ApiKeyDto>(`/admin/api-keys/${id}/expiry`, {
      method: "PATCH",
      body: JSON.stringify({ expiresAt }),
    });
  }

  /**
   * Issues a new secret, returned exactly once. The old one keeps working for `graceHours`
   * (default 24) so the partner can deploy without a gap; pass 0 when rotating because it leaked.
   */
  rotateApiKey(id: string, graceHours?: number) {
    return this.request<CreateApiKeyResult>(`/admin/api-keys/${id}/rotate`, {
      method: "POST",
      body: JSON.stringify({ graceHours }),
    });
  }

  deleteApiKey(id: string) {
    return this.request<void>(`/admin/api-keys/${id}`, { method: "DELETE" });
  }

  // ---- Seller: API keys ----
  listMySellerApiKeys() {
    return this.request<SellerApiKeyDto[]>("/seller/api-keys");
  }

  createMySellerApiKey(input: CreateSellerApiKeyInput) {
    return this.request<CreateSellerApiKeyResult>("/seller/api-keys", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  setMySellerApiKeyEnabled(id: string, isEnabled: boolean) {
    return this.request<SellerApiKeyDto>(`/seller/api-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled }),
    });
  }

  rotateMySellerApiKey(id: string) {
    return this.request<CreateSellerApiKeyResult>(
      `/seller/api-keys/${id}/rotate`,
      {
        method: "POST",
      },
    );
  }

  deleteMySellerApiKey(id: string) {
    return this.request<void>(`/seller/api-keys/${id}`, { method: "DELETE" });
  }

  // ---- Stories (public) ----
  listStories() {
    return this.request<StoryDetailDto[]>("/stories", { auth: false });
  }

  // ---- Admin: stories ----
  listAllStories() {
    return this.request<StoryDetailDto[]>("/stories/admin");
  }

  createStory(input: AdminStoryInput) {
    return this.request<StoryDetailDto>("/stories/admin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateStory(id: string, input: Partial<AdminStoryInput>) {
    return this.request<StoryDetailDto>(`/stories/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteStory(id: string) {
    return this.request<void>(`/stories/admin/${id}`, { method: "DELETE" });
  }

  // ---- Stories: seller-purchased ads ----
  getStoryAdPricing() {
    return this.request<AdPricingDto>("/stories/ad-pricing", { auth: false });
  }

  createMyStoryAd(input: CreateStoryAdInput) {
    return this.request<StoryDetailDto>("/stories/seller", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMyStoryAds() {
    return this.request<StoryDetailDto[]>("/stories/seller/me");
  }

  // ---- Home slides (public) ----
  listHomeSlides() {
    return this.request<HomeSlideDetailDto[]>("/home-slides", { auth: false });
  }

  // ---- Admin: home slides ----
  listAllHomeSlides() {
    return this.request<HomeSlideDetailDto[]>("/home-slides/admin");
  }

  createHomeSlide(input: AdminHomeSlideInput) {
    return this.request<HomeSlideDetailDto>("/home-slides/admin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateHomeSlide(id: string, input: Partial<AdminHomeSlideInput>) {
    return this.request<HomeSlideDetailDto>(`/home-slides/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteHomeSlide(id: string) {
    return this.request<void>(`/home-slides/admin/${id}`, { method: "DELETE" });
  }

  // ---- Home slides: seller-purchased ads ----
  getSlideAdPricing() {
    return this.request<AdPricingDto>("/home-slides/ad-pricing", {
      auth: false,
    });
  }

  createMySlideAd(input: CreateSlideAdInput) {
    return this.request<HomeSlideDetailDto>("/home-slides/seller", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMySlideAds() {
    return this.request<HomeSlideDetailDto[]>("/home-slides/seller/me");
  }

  // ---- Social links (public) ----
  listSocialLinks() {
    return this.request<SocialLinkDto[]>("/social-links", { auth: false });
  }

  // ---- Admin: social links ----
  listAllSocialLinks() {
    return this.request<SocialLinkDto[]>("/social-links/admin");
  }

  createSocialLink(input: AdminSocialLinkInput) {
    return this.request<SocialLinkDto>("/social-links/admin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateSocialLink(id: string, input: Partial<AdminSocialLinkInput>) {
    return this.request<SocialLinkDto>(`/social-links/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteSocialLink(id: string) {
    return this.request<void>(`/social-links/admin/${id}`, {
      method: "DELETE",
    });
  }

  // ---- Content pages (public) ----
  getContentPage(slug: string) {
    return this.request<ContentPageDto>(`/content-pages/${slug}`, {
      auth: false,
    });
  }

  // ---- Admin: content pages ----
  listAllContentPages() {
    return this.request<ContentPageDto[]>("/content-pages/admin/all");
  }

  createContentPage(input: AdminContentPageInput) {
    return this.request<ContentPageDto>("/content-pages/admin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateContentPage(id: string, input: Partial<AdminContentPageInput>) {
    return this.request<ContentPageDto>(`/content-pages/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteContentPage(id: string) {
    return this.request<void>(`/content-pages/admin/${id}`, {
      method: "DELETE",
    });
  }

  // ---- Order tracking (public) ----
  trackOrder(input: TrackOrderInput) {
    const qs = new URLSearchParams(input).toString();
    return this.request<TrackedOrderDto>(`/order-tracking?${qs}`, {
      auth: false,
    });
  }

  // ---- Support chat (customer) ----
  getMySupportThread() {
    return this.request<SupportThreadWithMessagesDto>("/support/thread");
  }

  sendSupportMessage(input: SendSupportMessageInput) {
    return this.request<SupportMessageDto>("/support/thread/messages", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  // ---- Support chat (staff) ----
  listSupportThreads() {
    return this.request<SupportThreadWithUnreadDto[]>("/support/admin/threads");
  }

  getSupportThread(id: string) {
    return this.request<SupportThreadWithMessagesDto>(
      `/support/admin/threads/${id}`,
    );
  }

  sendStaffSupportMessage(threadId: string, input: SendSupportMessageInput) {
    return this.request<SupportMessageDto>(
      `/support/admin/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  updateSupportThreadStatus(id: string, input: UpdateThreadStatusInput) {
    return this.request<void>(`/support/admin/threads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Admin: mail ----
  getEmailSettings() {
    return this.request<EmailSettingsDto>("/admin/mail/settings");
  }

  updateEmailSettings(input: UpdateEmailSettingsInput) {
    return this.request<EmailSettingsDto>("/admin/mail/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  listEmailLogs(limit = 100) {
    return this.request<EmailLogDto[]>(`/admin/mail/logs?limit=${limit}`);
  }

  sendTestEmail(input: SendTestEmailInput) {
    return this.request<void>("/admin/mail/test", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  sendMarketingEmail(input: SendMarketingEmailInput) {
    return this.request<SendMarketingEmailResult>("/admin/mail/marketing", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  // ---- Gallery (public) ----
  listGalleryCategories() {
    return this.request<GalleryCategoryDto[]>("/gallery/categories", {
      auth: false,
    });
  }

  listGalleryProducts(
    options: {
      categoryId?: string;
      sellerId?: string;
      storefrontId?: string;
      search?: string;
    } = {},
  ) {
    const qs = new URLSearchParams();
    if (options.categoryId) qs.set("categoryId", options.categoryId);
    if (options.sellerId) qs.set("sellerId", options.sellerId);
    if (options.storefrontId) qs.set("storefrontId", options.storefrontId);
    if (options.search) qs.set("search", options.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<GalleryProductDto[]>(`/gallery/products${suffix}`, {
      auth: false,
    });
  }

  // ---- Gallery (customer) ----
  createGalleryOrder(input: CreateGalleryOrderInput) {
    return this.request<GalleryOrderDto>("/gallery/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMyGalleryOrders() {
    return this.request<GalleryOrderDto[]>("/gallery/orders/me");
  }

  // ---- Gallery (admin) ----
  listAllGalleryCategories() {
    return this.request<GalleryCategoryDto[]>("/gallery/admin/categories");
  }

  createGalleryCategory(input: AdminGalleryCategoryInput) {
    return this.request<GalleryCategoryDto>("/gallery/admin/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateGalleryCategory(id: string, input: Partial<AdminGalleryCategoryInput>) {
    return this.request<GalleryCategoryDto>(`/gallery/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteGalleryCategory(id: string) {
    return this.request<void>(`/gallery/admin/categories/${id}`, {
      method: "DELETE",
    });
  }

  listAllGalleryProducts() {
    return this.request<GalleryProductDto[]>("/gallery/admin/products");
  }

  createGalleryProduct(input: AdminGalleryProductInput) {
    return this.request<GalleryProductDto>("/gallery/admin/products", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateGalleryProduct(id: string, input: Partial<AdminGalleryProductInput>) {
    return this.request<GalleryProductDto>(`/gallery/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteGalleryProduct(id: string) {
    return this.request<void>(`/gallery/admin/products/${id}`, {
      method: "DELETE",
    });
  }

  listAllGalleryOrders(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<GalleryOrderAdminDto[]>(`/gallery/admin/orders${qs}`);
  }

  updateGalleryOrderStatus(id: string, input: UpdateGalleryOrderStatusInput) {
    return this.request<void>(`/gallery/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Gallery (seller self-service) ----
  listMySellerProducts() {
    return this.request<GalleryProductDto[]>("/gallery/seller/products");
  }

  createMySellerProduct(input: SellerGalleryProductInput) {
    return this.request<GalleryProductDto>("/gallery/seller/products", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateMySellerProduct(id: string, input: Partial<SellerGalleryProductInput>) {
    return this.request<GalleryProductDto>(`/gallery/seller/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteMySellerProduct(id: string) {
    return this.request<void>(`/gallery/seller/products/${id}`, {
      method: "DELETE",
    });
  }

  listMySellerOrders() {
    return this.request<GalleryOrderAdminDto[]>("/gallery/seller/orders");
  }

  updateMySellerOrderStatus(id: string, input: UpdateGalleryOrderStatusInput) {
    return this.request<void>(`/gallery/seller/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Storefronts: a shop's own sections ----

  listMyStorefronts() {
    return this.request<StorefrontDto[]>("/gallery/seller/storefronts");
  }
  createMyStorefront(input: UpsertStorefrontInput) {
    return this.request<StorefrontDto>("/gallery/seller/storefronts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateMyStorefront(id: string, input: Partial<UpsertStorefrontInput>) {
    return this.request<StorefrontDto>(`/gallery/seller/storefronts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  /** Answers with how many products fell back to the shop's general list. */
  deleteMyStorefront(id: string) {
    return this.request<{ deleted: boolean; movedToGeneral: number }>(
      `/gallery/seller/storefronts/${id}`,
      { method: "DELETE" },
    );
  }

  // ---- Sellers (public) ----
  getSellerByHandle(handle: string) {
    return this.request<SellerDto>(`/sellers/${encodeURIComponent(handle)}`, {
      auth: false,
    });
  }

  // ---- Sellers (admin) ----
  listSellers() {
    return this.request<SellerAdminDto[]>("/sellers/admin");
  }

  createSeller(input: CreateSellerInput) {
    return this.request<SellerAdminDto>("/sellers/admin", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateSellerAdmin(id: string, input: UpdateSellerInput) {
    return this.request<SellerAdminDto>(`/sellers/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Sellers (self-service) ----
  getMySellerProfile() {
    return this.request<SellerMeDto>("/sellers/me");
  }

  updateMySellerProfile(input: UpdateSellerInput) {
    return this.request<SellerMeDto>("/sellers/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  getMySellerStats() {
    return this.request<SellerStatsDto>("/sellers/me/stats");
  }

  getMySellerTimeseries(days = 30) {
    return this.request<SellerTimeseriesPoint[]>(
      `/sellers/me/timeseries?days=${days}`,
    );
  }

  getMySellerTopProducts(limit = 5) {
    return this.request<SellerTopProductDto[]>(
      `/sellers/me/top-products?limit=${limit}`,
    );
  }

  getMySellerUnreadCount() {
    return this.request<{ count: number }>(
      "/support/seller-inbox/unread-count",
    );
  }

  getMySellerTelegramStatus() {
    return this.request<SellerTelegramStatusDto>("/sellers/me/telegram");
  }

  generateMySellerTelegramLinkCode() {
    return this.request<SellerTelegramLinkCodeDto>(
      "/sellers/me/telegram/link-code",
      { method: "POST" },
    );
  }

  unlinkMySellerTelegram() {
    return this.request<void>("/sellers/me/telegram", { method: "DELETE" });
  }

  // ---- Seller applications (public self-signup, admin-moderated) ----
  /**
   * Apply from an account that already exists.
   *
   * Sends neither phone nor password: both come from the session. `applyForSeller` below cannot
   * serve a signed-in person at all — it names a phone that is by definition already registered,
   * and the server refuses it.
   */
  applyAsSellerFromMyAccount(input: {
    handle: string;
    shopName: string;
    description?: string;
  }) {
    return this.request<{ id: string; status: string }>("/sellers/apply-as-me", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  applyForSeller(input: CreateSellerApplicationInput) {
    return this.request<SellerApplicationDto>("/sellers/apply", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listSellerApplications(status?: SellerApplicationStatus) {
    const qs = status ? `?status=${status}` : "";
    return this.request<SellerApplicationAdminDto[]>(
      `/sellers/applications${qs}`,
    );
  }

  approveSellerApplication(id: string, input: ReviewApplicationInput = {}) {
    return this.request<SellerAdminDto>(`/sellers/applications/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  rejectSellerApplication(id: string, input: ReviewApplicationInput = {}) {
    return this.request<SellerApplicationAdminDto>(
      `/sellers/applications/${id}/reject`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  // ---- Withdrawals (seller self-service) ----
  createMyWithdrawal(input: CreateWithdrawalInput) {
    return this.request<WithdrawalRequestDto>("/withdrawals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMyWithdrawals() {
    return this.request<WithdrawalRequestDto[]>("/withdrawals/me");
  }

  // ---- Withdrawals (admin) ----
  listAllWithdrawals(status?: WithdrawalStatus) {
    const qs = status ? `?status=${status}` : "";
    return this.request<WithdrawalRequestAdminDto[]>(`/withdrawals${qs}`);
  }

  approveWithdrawal(id: string, input: ReviewWithdrawalInput = {}) {
    return this.request<WithdrawalRequestDto>(`/withdrawals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  rejectWithdrawal(id: string, input: ReviewWithdrawalInput = {}) {
    return this.request<WithdrawalRequestDto>(`/withdrawals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listMySellerLedger(take = 100) {
    return this.request<SellerLedgerEntryDto[]>(
      `/seller-ledger/me?take=${take}`,
    );
  }

  reconcileSellerBalances() {
    return this.request<SellerBalanceMismatchDto[]>(
      "/seller-ledger/admin/reconciliation",
    );
  }

  // ---- Support chat with a seller (customer side) ----
  getMyThreadWithSeller(sellerId: string) {
    return this.request<SupportThreadWithMessagesDto>(
      `/support/seller/${sellerId}/thread`,
    );
  }

  sendMessageToSeller(sellerId: string, input: SendSupportMessageInput) {
    return this.request<SupportMessageDto>(
      `/support/seller/${sellerId}/thread/messages`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  // ---- Support chat (seller inbox) ----
  listSellerInboxThreads() {
    return this.request<SupportThreadWithUnreadDto[]>(
      "/support/seller-inbox/threads",
    );
  }

  getSellerInboxThread(id: string) {
    return this.request<SupportThreadWithMessagesDto>(
      `/support/seller-inbox/threads/${id}`,
    );
  }

  sendSellerInboxMessage(threadId: string, input: SendSupportMessageInput) {
    return this.request<SupportMessageDto>(
      `/support/seller-inbox/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  // ---- Documents (self-service) ----
  listMyDocuments() {
    return this.request<DocumentDto[]>("/documents");
  }

  uploadDocument(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<DocumentDto>("/documents", {
      method: "POST",
      body: form,
    });
  }

  deleteDocument(id: string) {
    return this.request<void>(`/documents/${id}`, { method: "DELETE" });
  }

  /** Authenticated binary download — bypasses `request()` since the response is a Blob, not JSON. */
  async downloadDocument(id: string, isRetry = false): Promise<Blob> {
    const headers = new Headers();
    const token = this.tokenStore.getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${this.baseUrl}/documents/${id}`, { headers });

    if (res.status === 401 && !isRetry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.downloadDocument(id, true);
      this.tokenStore.clear();
      this.onSessionExpired?.();
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: unknown;
        requestId?: string;
      };
      throw new ApiError(
        res.status,
        body.code ?? "UNKNOWN",
        toMessage(body.message, res.statusText),
        body.requestId,
      );
    }

    return res.blob();
  }

  // ---- Avatar (self-service) ----

  uploadAvatar(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<{ avatarUrl: string }>("/avatar", {
      method: "POST",
      body: form,
    });
  }

  deleteAvatar() {
    return this.request<void>("/avatar", { method: "DELETE" });
  }

  // ---- General-purpose image upload (gallery products, stories, home slides, logos) ----

  uploadImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<{ url: string }>("/uploads/image", {
      method: "POST",
      body: form,
    });
  }

  uploadMedia(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<{ url: string; mediaType: "IMAGE" | "VIDEO" }>(
      "/uploads/media",
      {
        method: "POST",
        body: form,
      },
    );
  }

  // ---- Social commerce feed ----
  listSocialFeed(cursor?: string, take = 12) {
    const qs = new URLSearchParams({ take: String(take) });
    if (cursor) qs.set("cursor", cursor);
    return this.request<SocialFeedPageDto>(`/social-feed?${qs}`, {
      auth: false,
    });
  }
  listMySocialFeed(cursor?: string, take = 12) {
    const qs = new URLSearchParams({ take: String(take) });
    if (cursor) qs.set("cursor", cursor);
    return this.request<SocialFeedPageDto>(`/social-feed/for-you?${qs}`);
  }
  createSocialPost(input: CreateSocialPostInput) {
    return this.request<SocialFeedPostDto>("/social-feed", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateSocialPost(id: string, input: UpdateSocialPostInput) {
    return this.request<SocialFeedPostDto>(`/social-feed/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  deleteSocialPost(id: string) {
    return this.request<void>(`/social-feed/${id}`, { method: "DELETE" });
  }
  likeSocialPost(id: string, active = true) {
    return this.request<{ active: boolean }>(`/social-feed/${id}/like`, {
      method: "POST",
      body: JSON.stringify({ active }),
    });
  }
  saveSocialPost(id: string, active = true) {
    return this.request<{ active: boolean }>(`/social-feed/${id}/save`, {
      method: "POST",
      body: JSON.stringify({ active }),
    });
  }
  recordSocialView(id: string) {
    return this.request<{ recorded: boolean }>(`/social-feed/${id}/view`, {
      method: "POST",
    });
  }
  recordSocialProductClick(id: string) {
    return this.request<{ recorded: boolean }>(
      `/social-feed/${id}/product-click`,
      { method: "POST" },
    );
  }
  createSocialComment(id: string, input: CreateSocialCommentInput) {
    return this.request(`/social-feed/${id}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  reportSocialPost(id: string, input: ReportSocialPostInput) {
    return this.request<{ ok: boolean }>(`/social-feed/${id}/report`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  listSocialPostsAdmin(status?: string) {
    return this.request<SocialFeedPostDto[]>(
      `/social-feed/admin/posts${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
  }
  listSocialReportQueue() {
    return this.request<{ postId: string; _count: { id: number } }[]>(
      "/social-feed/admin/reports",
    );
  }
  // ---- Chat: group invites ----

  chatInbox() {
    return this.request<ChatInboxEntryDto[]>("/chat/inbox");
  }
  private chatConversationPath(conversationId: string) {
    const [kind, id] = conversationId.split(":");
    if ((kind !== "room" && kind !== "thread") || !id)
      throw new Error("Invalid conversation");
    return `/chat/${kind === "room" ? "rooms" : "threads"}/${encodeURIComponent(id)}`;
  }
  chatConversation(conversationId: string) {
    return this.request<ChatConversationDto>(
      `${this.chatConversationPath(conversationId)}/messages`,
    );
  }
  sendChatMessage(conversationId: string, body: string) {
    return this.request<ChatMessageDto>(
      `${this.chatConversationPath(conversationId)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
  }
  markChatRead(conversationId: string) {
    return this.request<{ ok: boolean }>(
      `${this.chatConversationPath(conversationId)}/read`,
      { method: "POST" },
    );
  }
  createChatGroup(title: string) {
    return this.request<{
      conversationId: string;
      id: string;
      title: string;
      inviteCode: string;
    }>("/chat/groups", { method: "POST", body: JSON.stringify({ title }) });
  }
  chatGroupInfo(id: string) {
    return this.request<ChatGroupInfoDto>(
      `/chat/groups/${encodeURIComponent(id)}`,
    );
  }
  rotateChatInvite(id: string) {
    return this.request<{ inviteCode: string }>(
      `/chat/groups/${encodeURIComponent(id)}/invite/rotate`,
      { method: "POST" },
    );
  }
  leaveChatGroup(id: string) {
    return this.request<{ left: boolean }>(
      `/chat/groups/${encodeURIComponent(id)}/leave`,
      { method: "POST" },
    );
  }
  deleteMyChatGroup(id: string) {
    return this.request<{ deleted: boolean }>(
      `/chat/groups/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }
  chatChannels() {
    return this.request<ChatChannelDto[]>("/chat/channels");
  }
  subscribeChatChannel(id: string) {
    return this.request<{ subscribed: boolean }>(
      `/chat/channels/${encodeURIComponent(id)}/subscribe`,
      { method: "POST" },
    );
  }
  unsubscribeChatChannel(id: string) {
    return this.request<{ subscribed: boolean }>(
      `/chat/channels/${encodeURIComponent(id)}/unsubscribe`,
      { method: "POST" },
    );
  }

  /** What an invite link shows before somebody commits: a name and a size, nothing more. */
  chatInvitePreview(code: string) {
    return this.request<{
      id: string;
      title: string;
      memberCount: number;
      alreadyMember: boolean;
      conversationId: string;
    }>(`/chat/invites/${encodeURIComponent(code)}`);
  }
  joinChatInvite(code: string) {
    return this.request<{ conversationId: string; title: string }>(
      `/chat/invites/${encodeURIComponent(code)}/join`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }

  // ---- Admin: chat rooms ----
  ensureOfficialChatChannel(category: ChatOfficialCategory) {
    return this.request<
      Pick<ChatRoomAdminDto, "id" | "title" | "officialCategory">
    >("/chat/admin/official-channels", {
      method: "POST",
      body: JSON.stringify({ category }),
    });
  }
  getOfficialChatMessagesAdmin(id: string) {
    return this.request<ChatConversationDto>(
      `/chat/admin/official-channels/${encodeURIComponent(id)}/messages`,
    );
  }
  postOfficialChatMessageAdmin(id: string, body: string) {
    return this.request<ChatMessageDto>(
      `/chat/admin/official-channels/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
  }
  listChatRoomsAdmin() {
    return this.request<ChatRoomAdminDto[]>("/chat/admin/rooms");
  }
  createChatRoom(input: CreateChatRoomInput) {
    return this.request<ChatRoomAdminDto>("/chat/admin/rooms", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  addChatRoomMembers(id: string, memberIds: string[]) {
    return this.request<{ added: number }>(`/chat/admin/rooms/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ memberIds }),
    });
  }
  removeChatRoomMember(id: string, userId: string) {
    return this.request<{ removed: number }>(
      `/chat/admin/rooms/${id}/members/${userId}`,
      { method: "DELETE" },
    );
  }
  deleteChatRoom(id: string) {
    return this.request<{ deleted: boolean }>(`/chat/admin/rooms/${id}`, {
      method: "DELETE",
    });
  }

  moderateSocialPost(id: string, input: ModerateSocialPostInput) {
    return this.request<SocialFeedPostDto>(`/social-feed/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  listSocialCommentsAdmin(status?: string) {
    return this.request(
      `/social-feed/admin/comments${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
  }
  moderateSocialComment(id: string, input: ModerateSocialCommentInput) {
    return this.request(`/social-feed/admin/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // ---- Cargo compatibility aliases. Prefer api.cargo.* in new code. ----
  listCargoDirections() {
    return this.cargo.listDirections();
  }
  listCargoBanners() {
    return this.cargo.listBanners();
  }
  getCargoQuote(input: CreateQuoteInput) {
    return this.cargo.quote(input);
  }
  createShipment(input: CreateShipmentInput) {
    return this.cargo.createShipment(input);
  }
  listMyShipments() {
    return this.cargo.listMyShipments();
  }
  getShipment(id: string) {
    return this.cargo.getShipment(id);
  }
  requestShipmentPickup(id: string, input: CreatePickupRequestInput) {
    return this.cargo.requestPickup(id, input);
  }
  trackShipment(trackingNumber: string) {
    return this.cargo.track(trackingNumber);
  }
  listCargoCitiesAdmin() {
    return this.cargo.listCitiesAdmin();
  }
  createCargoCity(input: CreateCityInput) {
    return this.cargo.createCity(input);
  }
  updateCargoCity(id: string, input: UpdateCityInput) {
    return this.cargo.updateCity(id, input);
  }
  listCargoItemTypesAdmin() {
    return this.cargo.listItemTypesAdmin();
  }
  upsertCargoItemType(input: UpsertItemTypeInput) {
    return this.cargo.upsertItemType(input);
  }
  listCargoBannersAdmin() {
    return this.cargo.listBannersAdmin();
  }
  upsertCargoBanner(input: UpsertBannerInput) {
    return this.cargo.upsertBanner(input);
  }
  deleteCargoBanner(id: string) {
    return this.cargo.deleteBanner(id);
  }
  setCargoTariffBrackets(input: SetTariffBracketsInput) {
    return this.cargo.setTariffBrackets(input);
  }
  getCargoExchangeRate() {
    return this.cargo.getExchangeRate();
  }
  updateCargoExchangeRate(input: UpdateExchangeRateInput) {
    return this.cargo.updateExchangeRate(input);
  }
  listShipmentsAdmin(params?: { status?: string; search?: string }) {
    return this.cargo.listShipmentsAdmin(params);
  }
  getShipmentAdmin(id: string) {
    return this.cargo.getShipmentAdmin(id);
  }
  updateShipmentStatus(id: string, input: UpdateShipmentStatusInput) {
    return this.cargo.updateShipmentStatus(id, input);
  }
  addShipmentNote(id: string, note: string) {
    return this.cargo.addShipmentNote(id, note);
  }
}
