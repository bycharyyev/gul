import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Min } from "class-validator";

export class CreateShipmentDto {
  @IsString()
  originCityId!: string;

  @IsString()
  destinationCityId!: string;

  @IsString()
  itemTypeId!: string;

  @IsString()
  paymentMethodId!: string;

  @IsString()
  @Length(1, 120)
  senderName!: string;

  @IsString()
  @Length(6, 20)
  senderPhone!: string;

  @IsString()
  @Length(1, 500)
  pickupAddress!: string;

  @IsString()
  @Length(1, 120)
  recipientName!: string;

  @IsString()
  @Length(6, 20)
  recipientPhone!: string;

  @IsEnum(["WAREHOUSE_PICKUP", "DOOR_DELIVERY"])
  deliveryMode!: "WAREHOUSE_PICKUP" | "DOOR_DELIVERY";

  @IsOptional()
  @IsString()
  @Length(1, 500)
  deliveryAddress?: string;

  // Exactly one of these matters, decided by the cargo type's pricing unit; the server validates
  // which and never trusts a client-supplied price.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}
