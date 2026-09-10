import { ArrayMinSize, IsArray, IsNumber, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class TariffBracketDto {
  @IsNumber()
  @Min(0)
  minWeightKg!: number;

  @IsNumber()
  @Min(0.01)
  pricePerKgRub!: number;

  @IsNumber()
  @Min(0)
  pickupFeeRub!: number;
}

// Replaces the route's whole bracket set in one call -- see CargoService.setTariffBrackets for why
// a partial/single-bracket update isn't offered.
export class SetTariffBracketsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TariffBracketDto)
  brackets!: TariffBracketDto[];
}
