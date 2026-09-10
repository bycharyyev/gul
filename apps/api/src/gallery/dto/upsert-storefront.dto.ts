import { IsBoolean, IsInt, IsOptional, IsString, Length } from "class-validator";

export class UpsertStorefrontDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
