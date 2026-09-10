import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min, ValidateNested } from "class-validator";
import { CurrencyCode, MarketplacePurchaseStatus, MarketplaceSourceCode } from "@prisma/client";

export class MarketplaceCartItemDto {
  @IsEnum(MarketplaceSourceCode) sourceCode!: MarketplaceSourceCode;
  @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: true }) @Length(8, 2048) url!: string;
  @IsInt() @Min(1) @Max(99) quantity!: number;
  @IsOptional() @IsString() @Length(1, 200) variant?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(500) estimatedWeightKg?: number;

  // What the customer's own browser read off the product page. Accepted because a reviewer who
  // can see the product and its shop price prices an order in seconds instead of reopening the
  // marketplace by hand -- and because Ozon and Yandex refuse a server-side read entirely, so
  // there is no other way for the figure to exist.
  //
  // Bounded and stored under `reported*`, never under the verified `*Snapshot` columns, and never
  // read by anything that computes money. A quote is entered by a person; this only tells them
  // what they are looking at.
  @IsOptional() @IsString() @Length(1, 300) reportedTitle?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100000000) reportedPrice?: number;
  @IsOptional() @IsEnum(CurrencyCode) reportedCurrency?: CurrencyCode;
  @IsOptional() @IsString() @Length(1, 40) reportedSource?: string;
}

export class CreateMarketplacePurchaseDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => MarketplaceCartItemDto)
  items!: MarketplaceCartItemDto[];
  @IsEnum(CurrencyCode) currency!: CurrencyCode;
  @IsString() @Length(5, 500) deliveryAddress!: string;
  @IsString() @Length(8, 64) idempotencyKey!: string;
}

export class ReviewMarketplacePurchaseDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ReviewedMarketplaceItemDto)
  items!: ReviewedMarketplaceItemDto[];
  @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class ReviewedMarketplaceItemDto {
  @IsString() @Length(1, 100) itemId!: string;
  @IsString() @Length(1, 500) title!: string;
  @IsOptional() @IsString() @Length(1, 256) externalId?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) imageUrl?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000000) unitPriceTmt!: number;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(500) estimatedWeightKg!: number;
}

export class AcceptMarketplaceQuoteDto {
  @IsInt() @Min(1) quoteVersion!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) maxAuthorizedTmt!: number;
  @IsBoolean() consentAccepted!: boolean;
  @IsString() @Length(1, 32) consentVersion!: string;
}

export class ActualMarketplaceWeightDto {
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(10000) actualWeightKg!: number;
}

export class ConfirmMarketplaceAuthorizationDto {
  @IsString() @Length(2, 50) provider!: string;
  @IsString() @Length(8, 200) externalReference!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountTmt!: number;
}

export class ConfirmMarketplaceRefundDto {
  @IsString() @Length(8, 200) externalReference!: string;
}

export class UpdateMarketplacePurchaseStatusDto {
  @IsEnum(MarketplacePurchaseStatus) status!: MarketplacePurchaseStatus;
  @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class UpdateMarketplacePurchaseSettingsDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) serviceFeePercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shippingPerKgTmt?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minimumFeeTmt?: number;
  @IsOptional() @IsInt() @Min(5) @Max(10080) quoteTtlMinutes?: number;
}

export class UpdateMarketplaceSourceDto {
  @IsBoolean() isEnabled!: boolean;
  @IsBoolean() requiresManualReview!: boolean;
}

/** Which marketplace it is comes from the host, server-side -- never from the client. */
export class ResolveMarketplaceLinkDto {
  @IsString()
  @Length(8, 2048)
  url!: string;
}
