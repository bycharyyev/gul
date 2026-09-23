import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";

// Keyed by `code` rather than id: the three types are a fixed, meaningful set (PERSONAL_ITEMS,
// PHONE, MEDICINE) that both clients and the seed refer to by name, so an upsert is what an admin
// edit actually is. Cross-field rules (a per-item type needs a price, a per-kg type must not have
// one) live in CargoService.upsertItemType -- class-validator cannot express them cleanly.
export class UpsertItemTypeDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  description?: string;

  @IsEnum(["PER_KG", "PER_ITEM"])
  pricingUnit!: "PER_KG" | "PER_ITEM";

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerItemRub?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minWeightKg?: number | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
