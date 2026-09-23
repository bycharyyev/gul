import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";

export class CreateCityDto {
  @IsEnum(["ORIGIN", "DESTINATION"])
  role!: "ORIGIN" | "DESTINATION";

  @IsString()
  @Length(2, 8)
  country!: string;

  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
