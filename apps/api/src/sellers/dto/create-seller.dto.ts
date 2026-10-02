import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class CreateSellerDto {
  // Optional contact number; sign-in is by email.
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  /** The seller signs in with this address. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "INVALID_EMAIL" })
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

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
