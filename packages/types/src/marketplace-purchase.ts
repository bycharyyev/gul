import { z } from "zod";

export const MARKETPLACE_SOURCE_CODES = ["OZON","WILDBERRIES","ALIEXPRESS","TRENDYOL","YANDEX_MARKET","TAOBAO"] as const;
export type MarketplaceSourceCode = typeof MARKETPLACE_SOURCE_CODES[number];
export const MARKETPLACE_PURCHASE_STATUSES = ["DRAFT","MANUAL_REVIEW","QUOTED","AUTHORIZATION_PENDING","AUTHORIZED","PURCHASING","PURCHASED","AT_WAREHOUSE","FINAL_PAYMENT_DUE","READY_TO_SHIP","SHIPPED","DELIVERED","CANCELLED","REFUND_PENDING","REFUNDED"] as const;
export type MarketplacePurchaseStatus = typeof MARKETPLACE_PURCHASE_STATUSES[number];
export const marketplaceCartItemSchema = z.object({ sourceCode: z.enum(MARKETPLACE_SOURCE_CODES), url: z.string().url().startsWith("https://").max(2048), quantity: z.number().int().min(1).max(99), variant: z.string().min(1).max(200).optional(), estimatedWeightKg: z.number().positive().max(500).optional() });
export const createMarketplacePurchaseSchema = z.object({ items: z.array(marketplaceCartItemSchema).min(1).max(30), currency: z.enum(["USD","RUB","EUR","TRY","CNY","KZT"]), deliveryAddress: z.string().min(5).max(500), idempotencyKey: z.string().min(8).max(64) });
export type CreateMarketplacePurchaseInput = z.infer<typeof createMarketplacePurchaseSchema>;
export const acceptMarketplaceQuoteSchema = z.object({ quoteVersion: z.number().int().positive(), maxAuthorizedTmt: z.number().positive(), consentAccepted: z.literal(true), consentVersion: z.string().min(1).max(32) });
export type AcceptMarketplaceQuoteInput = z.infer<typeof acceptMarketplaceQuoteSchema>;
export interface MarketplacePurchaseSourceDto { code: MarketplaceSourceCode; name:string; allowedHosts:string[]; adapterKey:string; isEnabled:boolean; requiresManualReview:boolean; }
export interface MarketplacePurchaseItemDto { id:string; sourceCode:MarketplaceSourceCode; canonicalUrl:string; quantity:number; variant:string|null; titleSnapshot:string|null; imageUrlSnapshot:string|null; externalIdSnapshot:string|null; unitPriceSnapshot:string|null; sourceCurrencySnapshot:string|null; estimatedWeightKg:string|null; actualWeightKg:string|null; snapshotAt:string;
  /** Read in the customer's own browser off the product page they confirmed. Never verified by
   *  us, never an input to any amount charged -- it exists so a reviewer knows what they are
   *  pricing. Kept apart from the `*Snapshot` fields, which a server-side adapter produced. */
  reportedTitle:string|null; reportedPrice:string|null; reportedCurrency:string|null; reportedSource:string|null; }
export interface MarketplacePurchaseQuoteDto { id:string; version:number; productSubtotalTmt:string; serviceFeeTmt:string; shippingTmt:string; totalTmt:string; weightKg:string; weightConfidence:"ESTIMATED"|"EXACT"; fxSnapshot:Record<string,unknown>; expiresAt:string; createdAt:string; }
export interface MarketplacePurchaseLedgerEntryDto { id:string; type:"BALANCE_DEBIT"|"AUTHORIZATION"|"SETTLEMENT"|"REFUND_CREDIT"; amountTmt:string; externalRef:string|null; createdAt:string; }
export interface MarketplacePurchaseDto { id:string; userId:string; status:MarketplacePurchaseStatus; currency:string; deliveryAddress:string; acceptedQuoteVersion:number|null; maxAuthorizedTmt:string|null; authorizedTmt:string; settledTmt:string; refundedTmt:string; consentAcceptedAt:string|null; items:MarketplacePurchaseItemDto[]; quotes:MarketplacePurchaseQuoteDto[]; ledgerEntries?:MarketplacePurchaseLedgerEntryDto[]; }
/** Quotes are returned oldest→newest by the API; this is the single client-side expected-total rule. */
export function getMarketplaceExpectedTotalTmt(order: MarketplacePurchaseDto): string | null {
  return order.quotes.length ? order.quotes[order.quotes.length - 1]!.totalTmt : null;
}
