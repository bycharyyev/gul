import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class UpdateMeDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @IsOptional()
  @IsIn(["ru", "en", "tkm"])
  locale?: string;
}
