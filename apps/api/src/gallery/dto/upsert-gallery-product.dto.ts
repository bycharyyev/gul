import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";

export class UpsertGalleryProductDto {
  @IsString()
  categoryId!: string;

  @IsString()
  @Length(1, 40)
  sku!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  imageUrl!: string;

  @IsNumber()
  @Min(0)
  priceTmt!: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /**
   * The seller's own section this product belongs to. Null moves it back to the general list.
   *
   * Validated against who is asking, never trusted from the body: the id alone would otherwise
   * let one shop put a product on another shop's shelf.
   */
  @IsOptional()
  @IsString()
  storefrontId?: string | null;
}
