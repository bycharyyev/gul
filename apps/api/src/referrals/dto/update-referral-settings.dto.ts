import { IsBoolean, IsNumber, IsOptional, Min } from "class-validator";

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customerRewardTmt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellerRewardTmt?: number;
}
