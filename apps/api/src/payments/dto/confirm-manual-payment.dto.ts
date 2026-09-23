import { IsString, Length } from "class-validator";

export class ConfirmManualPaymentDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}
