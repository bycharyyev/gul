import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

// Weight and quantity are both optional here because which one is required depends on the cargo
// type's pricing unit, which only the server knows -- CargoService.priceShipment rejects the wrong
// one with a message naming what it actually needs.
export class CreateQuoteDto {
  @IsString()
  itemTypeId!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  declaredWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
