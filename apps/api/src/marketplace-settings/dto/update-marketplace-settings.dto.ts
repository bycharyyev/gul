import { IsNumber, Max, Min } from "class-validator";

export class UpdateMarketplaceSettingsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  takeRatePercent!: number;
}
