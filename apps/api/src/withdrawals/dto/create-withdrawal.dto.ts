import { IsNumber, IsPositive, IsString, Length } from "class-validator";

export class CreateWithdrawalDto {
  @IsNumber()
  @IsPositive()
  amountTmt!: number;

  @IsString()
  @Length(3, 300)
  payoutDetails!: string;
}
