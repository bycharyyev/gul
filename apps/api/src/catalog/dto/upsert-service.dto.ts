import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";
import { RECIPIENT_INPUT_TYPES, type RecipientInputType } from "@topup-hub/types";

export class UpsertServiceDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsEnum(RECIPIENT_INPUT_TYPES)
  inputType!: RecipientInputType;

  @IsOptional()
  @IsString()
  validationRegex?: string;

  @IsNumber()
  @Min(0)
  minAmountTmt!: number;

  @IsNumber()
  @Min(0)
  maxAmountTmt!: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
