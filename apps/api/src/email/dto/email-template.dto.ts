import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { EMAIL_LOCALES } from "../email-kinds";

const EMAIL_KIND_VALUES = [
  "AUTH_OTP",
  "AUTH_EMAIL_VERIFICATION",
  "AUTH_PASSWORD_RESET",
  "AUTH_LOGIN_ALERT",
  "AUTH_NEW_DEVICE",
  "AUTH_EMAIL_CHANGED",
  "ACCOUNT_CREATED",
  "ACCOUNT_PASSWORD_CHANGED",
  "ACCOUNT_DELETED",
  "ORDER_CREATED",
  "ORDER_COMPLETED",
  "ORDER_FAILED",
  "ORDER_PAID",
  "ORDER_CANCELLED",
  "ORDER_REFUNDED",
  "SELLER_APPLICATION_RECEIVED",
  "SELLER_APPROVED",
  "SELLER_REJECTED",
  "SELLER_NEW_ORDER",
  "SELLER_ORDER_CANCELLED",
  "SELLER_PAYOUT",
  "SYSTEM_MAINTENANCE",
  "SYSTEM_SECURITY_ALERT",
  "SYSTEM_IMPORTANT_NOTICE",
  "MARKETING",
  "MARKETING_NEWSLETTER",
  "MARKETING_PROMOTION",
  "MARKETING_NEW_FEATURE",
  "MARKETING_PARTNER_OFFER",
  "TEST",
] as const;

export class SaveEmailTemplateDto {
  @IsIn(EMAIL_KIND_VALUES as unknown as string[])
  kind!: (typeof EMAIL_KIND_VALUES)[number];

  @IsIn(EMAIL_LOCALES as unknown as string[])
  locale!: string;

  @IsString()
  @Length(1, 300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  preheader?: string;

  // Generous but bounded: a template is hand-authored markup, not an upload path. The real
  // safety check is EmailTemplateService.validate, which rejects unknown variables and any
  // expression-like placeholder before the version is stored.
  @IsString()
  @Length(1, 100_000)
  html!: string;

  @IsString()
  @Length(1, 20_000)
  text!: string;
}
