import { IsOptional, IsString, Length } from "class-validator";

export class CreateGalleryOrderDto {
  @IsString()
  productId!: string;

  @IsString()
  @Length(1, 120)
  recipientName!: string;

  @IsString()
  @Length(3, 32)
  recipientPhone!: string;

  @IsString()
  @Length(1, 80)
  deliveryCity!: string;

  @IsString()
  @Length(1, 300)
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  cardMessage?: string;
}
