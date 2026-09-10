import { IsOptional, IsString, Length } from "class-validator";

export class CreateStoryAdDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  subtitle?: string;

  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  ctaLabel?: string;

  @IsString()
  galleryProductId!: string;
}
