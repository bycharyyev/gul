import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateSellerDto {
  @IsString()
  @Length(6, 20)
  phone!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-z0-9_]+$/, {
    message: "handle may only contain lowercase letters, digits, and underscores",
  })
  handle!: string;

  @IsString()
  @Length(1, 120)
  shopName!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
