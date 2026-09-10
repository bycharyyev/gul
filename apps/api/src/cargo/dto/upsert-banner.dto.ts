import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, IsUrl, Length, Min } from "class-validator";

export class UpsertBannerDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  subtitle?: string;

  // require_tld off so an S3/CDN host without a public TLD still validates; the point of the check
  // is to reject a relative path or javascript: URL, not to police hostnames.
  @IsUrl({ require_tld: false })
  imageUrl!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  linkUrl?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
