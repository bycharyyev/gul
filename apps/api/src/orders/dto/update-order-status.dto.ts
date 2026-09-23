import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ORDER_STATUSES, type OrderStatus } from "@topup-hub/types";

export class UpdateOrderStatusDto {
  @IsEnum(ORDER_STATUSES)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
