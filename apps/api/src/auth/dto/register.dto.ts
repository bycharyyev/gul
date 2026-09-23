import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class RegisterDto {
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
