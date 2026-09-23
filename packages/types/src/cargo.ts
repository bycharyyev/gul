import { z } from "zod";
import { paymentMethodSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// Cargo. See docs/CARGO/ARCHITECTURE.md. Origin and destination are two independent admin-managed
// lists (any RU city -> any of the 6 Turkmen provinces) and the price comes from WHAT is shipped,
// not from the pair: weighed goods use the global RUB weight brackets, counted goods (phones,
// medicines) a per-unit RUB price. Both convert to TMT through independent USD cross-rates.
// ---------------------------------------------------------------------------

export const shipmentStatusSchema = z.enum([
  "DRAFT",
  "QUOTE_CREATED",
  "PENDING_PAYMENT",
  "PAID",
  "PICKUP_REQUESTED",
  "PICKUP_CONFIRMED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "ON_HOLD",
  "EXCEPTION",
]);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

export const shipmentDeliveryModeSchema = z.enum(["WAREHOUSE_PICKUP", "DOOR_DELIVERY"]);
export type ShipmentDeliveryMode = z.infer<typeof shipmentDeliveryModeSchema>;

export const cargoPickupStatusSchema = z.enum(["REQUESTED", "CONFIRMED", "PICKED_UP", "CANCELLED", "FAILED"]);
export type CargoPickupStatus = z.infer<typeof cargoPickupStatusSchema>;

export const cargoCityRoleSchema = z.enum(["ORIGIN", "DESTINATION"]);
export type CargoCityRole = z.infer<typeof cargoCityRoleSchema>;

export const cargoCitySchema = z.object({
  id: z.string(),
  role: cargoCityRoleSchema,
  country: z.string(),
  name: z.string(),
  isEnabled: z.boolean(),
  sortOrder: z.number(),
});
export type CargoCityDto = z.infer<typeof cargoCitySchema>;

export const cargoPricingUnitSchema = z.enum(["PER_KG", "PER_ITEM"]);
export type CargoPricingUnit = z.infer<typeof cargoPricingUnitSchema>;

export const cargoItemTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pricingUnit: cargoPricingUnitSchema,
  /** PER_ITEM only; null for weighed types, whose price comes from the brackets. */
  pricePerItemRub: z.number().nullable(),
  /** PER_KG only: the partner will not move less than this. */
  minWeightKg: z.number().nullable(),
});
export type CargoItemTypeDto = z.infer<typeof cargoItemTypeSchema>;

export const cargoBannerSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  linkUrl: z.string().nullable(),
});
export type CargoBannerDto = z.infer<typeof cargoBannerSchema>;

/** One call so a client can draw the whole form without a half-populated first paint. */
export const cargoDirectionsSchema = z.object({
  origins: z.array(cargoCitySchema),
  destinations: z.array(cargoCitySchema),
  itemTypes: z.array(cargoItemTypeSchema),
  weightBrackets: z.array(
    z.object({ minWeightKg: z.number(), pricePerKgRub: z.number(), pickupFeeRub: z.number() }),
  ),
});
export type CargoDirectionsDto = z.infer<typeof cargoDirectionsSchema>;

export const cargoTariffBracketSchema = z.object({
  id: z.string(),
  minWeightKg: z.number(),
  pricePerKgRub: z.number(),
  pickupFeeRub: z.number(),
  isActive: z.boolean(),
});
export type CargoTariffBracketDto = z.infer<typeof cargoTariffBracketSchema>;

export const cargoItemTypeAdminSchema = cargoItemTypeSchema.extend({
  isEnabled: z.boolean(),
  sortOrder: z.number(),
});
export type CargoItemTypeAdminDto = z.infer<typeof cargoItemTypeAdminSchema>;

export const cargoBannerAdminSchema = cargoBannerSchema.extend({
  isEnabled: z.boolean(),
  sortOrder: z.number(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
});
export type CargoBannerAdminDto = z.infer<typeof cargoBannerAdminSchema>;

export const cargoExchangeRateSchema = z.object({
  rubPerUsd: z.number(),
  tmtPerUsd: z.number(),
  updatedAt: z.string(),
});
export type CargoExchangeRateDto = z.infer<typeof cargoExchangeRateSchema>;

// Which of the two the server actually requires depends on the cargo type's pricing unit, so both
// are optional here and the API rejects the wrong one by name.
export const createQuoteSchema = z.object({
  itemTypeId: z.string(),
  declaredWeightKg: z.number().positive().optional(),
  quantity: z.number().int().min(1).optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const cargoQuoteSchema = z.object({
  itemTypeId: z.string(),
  pricingUnit: cargoPricingUnitSchema,
  declaredWeightKg: z.number().nullable(),
  quantity: z.number(),
  pricePerKgTmt: z.number().nullable(),
  pricePerItemTmt: z.number().nullable(),
  pickupFeeTmt: z.number(),
  totalPriceTmt: z.number(),
});
export type CargoQuoteDto = z.infer<typeof cargoQuoteSchema>;

export const createShipmentSchema = z.object({
  originCityId: z.string(),
  destinationCityId: z.string(),
  itemTypeId: z.string(),
  paymentMethodId: z.string(),
  senderName: z.string().min(1).max(120),
  senderPhone: z.string().min(6).max(20),
  pickupAddress: z.string().min(1).max(500),
  recipientName: z.string().min(1).max(120),
  recipientPhone: z.string().min(6).max(20),
  deliveryMode: shipmentDeliveryModeSchema,
  deliveryAddress: z.string().min(1).max(500).optional(),
  declaredWeightKg: z.number().positive().optional(),
  quantity: z.number().int().min(1).optional(),
  fragile: z.boolean().optional(),
  notes: z.string().min(1).max(1000).optional(),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const createPickupRequestSchema = z.object({
  address: z.string().min(1).max(500),
  requestedDate: z.string(),
  timeWindow: z.string().min(1).max(60),
  phone: z.string().min(6).max(20),
  notes: z.string().min(1).max(1000).optional(),
});
export type CreatePickupRequestInput = z.infer<typeof createPickupRequestSchema>;

export const shipmentTrackingEventSchema = z.object({
  status: shipmentStatusSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.object({ id: z.string(), phone: z.string(), fullName: z.string().nullable() }).optional(),
});
export type ShipmentTrackingEventDto = z.infer<typeof shipmentTrackingEventSchema>;

export const cargoPickupRequestSchema = z.object({
  id: z.string(),
  address: z.string(),
  requestedDate: z.string(),
  timeWindow: z.string(),
  phone: z.string(),
  status: cargoPickupStatusSchema,
  notes: z.string().nullable(),
});
export type CargoPickupRequestDto = z.infer<typeof cargoPickupRequestSchema>;

export const shipmentSchema = z.object({
  id: z.string(),
  publicTrackingNumber: z.string(),
  userId: z.string(),
  originCityId: z.string(),
  destinationCityId: z.string(),
  itemTypeId: z.string(),
  tariffId: z.string().nullable(),
  paymentMethodId: z.string(),
  senderName: z.string(),
  senderPhone: z.string(),
  pickupAddress: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  deliveryAddress: z.string().nullable(),
  deliveryMode: shipmentDeliveryModeSchema,
  declaredWeightKg: z.number().nullable(),
  quantity: z.number(),
  fragile: z.boolean(),
  notes: z.string().nullable(),
  pricePerKgRubSnapshot: z.number().nullable(),
  pricePerItemRubSnapshot: z.number().nullable(),
  pickupFeeRubSnapshot: z.number(),
  totalPriceRub: z.number(),
  rubPerUsdSnapshot: z.number(),
  tmtPerUsdSnapshot: z.number(),
  totalPriceTmt: z.number(),
  status: shipmentStatusSchema,
  paidAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  originCity: cargoCitySchema,
  destinationCity: cargoCitySchema,
  itemType: cargoItemTypeSchema,
  paymentMethod: paymentMethodSchema,
  pickup: cargoPickupRequestSchema.nullable(),
  trackingEvents: z.array(shipmentTrackingEventSchema),
  user: z.object({ id: z.string(), phone: z.string(), fullName: z.string().nullable() }).optional(),
});
export type ShipmentDto = z.infer<typeof shipmentSchema>;

export const shipmentListItemSchema = z.object({
  id: z.string(),
  publicTrackingNumber: z.string(),
  status: shipmentStatusSchema,
  totalPriceTmt: z.number(),
  declaredWeightKg: z.number().nullable(),
  quantity: z.number(),
  createdAt: z.string(),
  originCity: cargoCitySchema,
  destinationCity: cargoCitySchema,
  itemType: cargoItemTypeSchema,
  user: z.object({ id: z.string(), phone: z.string(), fullName: z.string().nullable() }),
});
export type ShipmentListItemDto = z.infer<typeof shipmentListItemSchema>;

export const shipmentListResponseSchema = z.object({
  items: z.array(shipmentListItemSchema),
  total: z.number(),
});
export type ShipmentListResponseDto = z.infer<typeof shipmentListResponseSchema>;

export const publicTrackingSchema = z.object({
  publicTrackingNumber: z.string(),
  status: shipmentStatusSchema,
  createdAt: z.string(),
  originCity: z.object({ name: z.string(), country: z.string() }),
  destinationCity: z.object({ name: z.string(), country: z.string() }),
  itemType: z.object({ name: z.string() }),
  trackingEvents: z.array(z.object({ status: shipmentStatusSchema, note: z.string().nullable(), createdAt: z.string() })),
});
export type PublicTrackingDto = z.infer<typeof publicTrackingSchema>;

export const createCitySchema = z.object({
  role: cargoCityRoleSchema,
  country: z.string().min(2).max(8),
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateCityInput = z.infer<typeof createCitySchema>;

export const updateCitySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateCityInput = z.infer<typeof updateCitySchema>;

export const upsertItemTypeSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(300).optional(),
  pricingUnit: cargoPricingUnitSchema,
  pricePerItemRub: z.number().min(0.01).nullable().optional(),
  minWeightKg: z.number().min(0).nullable().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpsertItemTypeInput = z.infer<typeof upsertItemTypeSchema>;

export const upsertBannerSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  subtitle: z.string().min(1).max(200).optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
export type UpsertBannerInput = z.infer<typeof upsertBannerSchema>;

export const tariffBracketInputSchema = z.object({
  minWeightKg: z.number().min(0),
  pricePerKgRub: z.number().positive(),
  pickupFeeRub: z.number().min(0),
});
export type TariffBracketInput = z.infer<typeof tariffBracketInputSchema>;

export const setTariffBracketsSchema = z.object({
  brackets: z.array(tariffBracketInputSchema).min(1),
});
export type SetTariffBracketsInput = z.infer<typeof setTariffBracketsSchema>;

export const updateExchangeRateSchema = z.object({
  rubPerUsd: z.number().positive(),
  tmtPerUsd: z.number().positive(),
});
export type UpdateExchangeRateInput = z.infer<typeof updateExchangeRateSchema>;

export const updateShipmentStatusSchema = z.object({
  status: shipmentStatusSchema,
  note: z.string().min(1).max(1000).optional(),
});
export type UpdateShipmentStatusInput = z.infer<typeof updateShipmentStatusSchema>;

