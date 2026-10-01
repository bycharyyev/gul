import { IsNumber, Max, Min, ValidateIf } from "class-validator";

export class SetServiceCostDto {
  /** Share of the face value paid to the operator/supplier, 0-100. null clears it (unknown). */
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  costPercent!: number | null;
}
