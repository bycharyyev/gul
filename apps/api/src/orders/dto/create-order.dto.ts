import { IsEnum, IsNumber, IsPositive, IsString, Length } from "class-validator";
import { CURRENCY_CODES, type CurrencyCode } from "@topup-hub/types";

export class CreateOrderDto {
  @IsString()
  serviceId!: string;

  @IsString()
  paymentMethodId!: string;

  @IsString()
  @Length(3, 64)
  recipientIdentifier!: string;

  @IsNumber()
  @IsPositive()
  amountTmt!: number;

  @IsEnum(CURRENCY_CODES)
  currency!: CurrencyCode;
}
