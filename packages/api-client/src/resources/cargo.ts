import type {
  CargoBannerAdminDto,
  CargoBannerDto,
  CargoCityDto,
  CargoDirectionsDto,
  CargoExchangeRateDto,
  CargoItemTypeAdminDto,
  CargoQuoteDto,
  CreateCityInput,
  CreatePickupRequestInput,
  CreateQuoteInput,
  CreateShipmentInput,
  PublicTrackingDto,
  SetTariffBracketsInput,
  ShipmentDto,
  ShipmentListResponseDto,
  UpdateCityInput,
  UpdateExchangeRateInput,
  UpdateShipmentStatusInput,
  UpsertBannerInput,
  UpsertItemTypeInput,
  AcceptMarketplaceQuoteInput,
  CreateMarketplacePurchaseInput,
  MarketplacePurchaseDto,
  MarketplacePurchaseSourceDto,
} from "@topup-hub/types";
import type { ApiRequest } from "../core/request.js";

/** Domain-scoped Cargo API. ApiClient keeps compatibility aliases for existing applications. */
export class CargoResource {
  constructor(private readonly request: ApiRequest) {}

  /** Both city lists, the priced cargo types and the weight brackets in one call. */
  listDirections() {
    return this.request<CargoDirectionsDto>("/cargo/directions");
  }

  listBanners() {
    return this.request<CargoBannerDto[]>("/cargo/banners", { auth: false });
  }

  listMarketplaceSources() { return this.request<MarketplacePurchaseSourceDto[]>("/cargo/marketplace-purchases/sources", { auth: false }); }
  createMarketplacePurchase(input: CreateMarketplacePurchaseInput) { return this.request<MarketplacePurchaseDto>("/cargo/marketplace-purchases/orders", { method: "POST", body: JSON.stringify(input) }); }
  listMyMarketplacePurchases() { return this.request<MarketplacePurchaseDto[]>("/cargo/marketplace-purchases/orders"); }
  getMarketplacePurchase(id: string) { return this.request<MarketplacePurchaseDto>(`/cargo/marketplace-purchases/orders/${id}`); }
  acceptMarketplaceQuote(id: string, input: AcceptMarketplaceQuoteInput) { return this.request<MarketplacePurchaseDto>(`/cargo/marketplace-purchases/orders/${id}/accept-quote`, { method: "POST", body: JSON.stringify(input) }); }

  quote(input: CreateQuoteInput) {
    return this.request<CargoQuoteDto>("/cargo/quote", { method: "POST", body: JSON.stringify(input) });
  }

  createShipment(input: CreateShipmentInput) {
    return this.request<ShipmentDto>("/cargo/shipments", { method: "POST", body: JSON.stringify(input) });
  }

  listMyShipments() {
    return this.request<ShipmentDto[]>("/cargo/shipments/me");
  }

  getShipment(id: string) {
    return this.request<ShipmentDto>(`/cargo/shipments/${id}`);
  }

  requestPickup(id: string, input: CreatePickupRequestInput) {
    return this.request<ShipmentDto>(`/cargo/shipments/${id}/pickup`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  track(trackingNumber: string) {
    return this.request<PublicTrackingDto>(`/cargo/track/${encodeURIComponent(trackingNumber)}`, { auth: false });
  }

  listCitiesAdmin() {
    return this.request<CargoCityDto[]>("/admin/cargo/cities");
  }

  createCity(input: CreateCityInput) {
    return this.request<CargoCityDto>("/admin/cargo/cities", { method: "POST", body: JSON.stringify(input) });
  }

  updateCity(id: string, input: UpdateCityInput) {
    return this.request<CargoCityDto>(`/admin/cargo/cities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  listItemTypesAdmin() {
    return this.request<CargoItemTypeAdminDto[]>("/admin/cargo/item-types");
  }

  upsertItemType(input: UpsertItemTypeInput) {
    return this.request<CargoItemTypeAdminDto>("/admin/cargo/item-types", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listBannersAdmin() {
    return this.request<CargoBannerAdminDto[]>("/admin/cargo/banners");
  }

  upsertBanner(input: UpsertBannerInput) {
    return this.request<CargoBannerAdminDto>("/admin/cargo/banners", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteBanner(id: string) {
    return this.request<{ deleted: boolean }>(`/admin/cargo/banners/${id}`, { method: "DELETE" });
  }

  /** Brackets are global now, not per route -- one set priced against every direction. */
  setTariffBrackets(input: SetTariffBracketsInput) {
    return this.request("/admin/cargo/tariffs", { method: "POST", body: JSON.stringify(input) });
  }

  getExchangeRate() {
    return this.request<CargoExchangeRateDto | null>("/admin/cargo/exchange-rate");
  }

  updateExchangeRate(input: UpdateExchangeRateInput) {
    return this.request<CargoExchangeRateDto>("/admin/cargo/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  listShipmentsAdmin(params?: { status?: string; search?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return this.request<ShipmentListResponseDto>(`/admin/cargo/shipments${qs ? `?${qs}` : ""}`);
  }

  getShipmentAdmin(id: string) {
    return this.request<ShipmentDto>(`/admin/cargo/shipments/${id}`);
  }

  updateShipmentStatus(id: string, input: UpdateShipmentStatusInput) {
    return this.request<ShipmentDto>(`/admin/cargo/shipments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  addShipmentNote(id: string, note: string) {
    return this.request<ShipmentDto>(`/admin/cargo/shipments/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }
}
