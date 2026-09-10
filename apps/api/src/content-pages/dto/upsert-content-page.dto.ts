import { IsOptional, IsString, Length } from "class-validator";

export class UpsertContentPageDto {
  @IsString()
  @Length(1, 60)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  titleEn?: string;

  @IsOptional()
  @IsString()
  bodyEn?: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  titleTkm?: string;

  @IsOptional()
  @IsString()
  bodyTkm?: string;
}
