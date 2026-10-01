import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

// Every field optional so the admin can save one group (take rate, or ad pricing) without
// resending the others.
export class UpdateMarketplaceSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  takeRatePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  storyAdPriceTmt?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  storyAdDurationDays?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  slideAdPriceTmt?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  slideAdDurationDays?: number;
}
