import { IsBoolean } from "class-validator";

export class SetPaymentMethodEnabledDto {
  @IsBoolean()
  isEnabled!: boolean;
}
