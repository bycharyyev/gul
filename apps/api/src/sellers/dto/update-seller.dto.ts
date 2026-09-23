import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, Length, Matches } from "class-validator";

export class UpdateSellerDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-z0-9_]+$/, {
    message: "handle may only contain lowercase letters, digits, and underscores",
  })
  handle?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  shopName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  defaultPayoutDetails?: string;
}
