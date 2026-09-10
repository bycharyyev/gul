import { IsBoolean, IsInt, IsOptional, IsString, Length } from "class-validator";

export class UpsertGalleryCategoryDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @Length(1, 60)
  slug!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
