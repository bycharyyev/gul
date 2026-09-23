import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, MaxLength, Matches } from "class-validator";

export class CreateSellerApplicationDto {
  @IsString()
  @Length(6, 20)
  phone!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  // Required: until approval this is the only channel that reaches the applicant, since Telegram
  // linking needs an approved Seller to issue a code.
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Некорректный email" })
  @MaxLength(254)
  email!: string;

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
}
