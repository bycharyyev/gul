import { IsNumber, Min } from "class-validator";

// Both USD cross-rates, not a single derived RUB->TMT number -- see CargoExchangeRate's schema
// comment for why storing the derived number directly goes stale silently.
export class UpdateExchangeRateDto {
  @IsNumber()
  @Min(0.01)
  rubPerUsd!: number;

  @IsNumber()
  @Min(0.01)
  tmtPerUsd!: number;
}
