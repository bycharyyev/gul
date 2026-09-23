import { IsNumber, IsOptional, IsPositive, IsString, Length } from "class-validator";

export class UpdateOrderDetailsDto {
  @IsOptional()
  @IsString()
  @Length(3, 64)
  recipientIdentifier?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amountTmt?: number;
}
