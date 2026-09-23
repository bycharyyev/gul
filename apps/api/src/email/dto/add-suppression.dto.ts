import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const REASONS = ["HARD_BOUNCE", "COMPLAINT", "UNSUBSCRIBED", "INVALID", "MANUAL"] as const;

export class AddSuppressionDto {
  @IsEmail({}, { message: "Некорректный email" })
  @MaxLength(254)
  email!: string;

  @IsIn(REASONS as unknown as string[])
  reason!: (typeof REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
