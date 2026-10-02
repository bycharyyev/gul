import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class RegisterDto {
  // Accounts are created and signed into by email (since 2026-10-02); a phone is optional and is
  // added later in the profile.
  @Transform(normalizeEmail)
  @IsEmail({}, { message: "INVALID_EMAIL" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  referredByUsername?: string;

  // Attribution captured client-side when the /r/<code> link was opened, carried through to
  // registration alongside the code. All optional -- see the note on Referral in schema.prisma.
  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  referrerUrl?: string;

  @IsOptional()
  @IsIn(["ru", "en", "tkm"])
  locale?: string;
}

/** Second step of sign-up: the code mailed to the address in RegisterDto. */
export class ConfirmRegistrationDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: "INVALID_EMAIL" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "INVALID_CODE" })
  code!: string;
}
