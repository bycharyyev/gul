import { IsOptional, IsString, IsUrl, Length } from "class-validator";

export class CreateAnalyticsLinkDto {
  @IsString()
  @Length(1, 80)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  description?: string;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  url!: string;
}
