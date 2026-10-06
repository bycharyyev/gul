import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

/** PATCH of one payment method from the admin console: any subset of these fields. */
export class SetPaymentMethodEnabledDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  /** Adapter key; must be one this build knows (see PaymentProviderRegistry.catalog). */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  feePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

const CODES = ["CARD", "SBP", "MIR", "CRYPTO", "MANUAL"] as const;

/** A new payment method for a code that has none yet. Always created switched off. */
export class CreatePaymentMethodDto {
  @IsIn(CODES)
  code!: (typeof CODES)[number];

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @Length(1, 40)
  provider!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  feePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}
