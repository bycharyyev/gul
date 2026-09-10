import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { SHIPMENT_STATUSES, type ShipmentStatusValue } from "../cargo.constants";

export class UpdateShipmentStatusDto {
  @IsEnum(SHIPMENT_STATUSES)
  status!: ShipmentStatusValue;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;
}
