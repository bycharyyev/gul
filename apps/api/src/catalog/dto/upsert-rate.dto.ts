import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { CURRENCY_CODES, type CurrencyCode } from "@topup-hub/types";

export class UpsertRateDto {
  @IsEnum(CURRENCY_CODES)
  currency!: CurrencyCode;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  manualMode?: boolean;
}
