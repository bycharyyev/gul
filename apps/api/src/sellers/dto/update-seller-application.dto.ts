import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";
import { IsPhone } from "./phone";

/** Staff edit of a pending application, before the decision. Same rules as the public form. */
export class UpdateSellerApplicationDto {
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
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Некорректный email" })
  email?: string;

  @IsOptional()
  @IsPhone()
  phone?: string;
}
