import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length } from "class-validator";
import { HOME_SLIDE_LINK_TYPES, type HomeSlideLinkType } from "@topup-hub/types";

export class UpsertHomeSlideDto {
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

  @IsEnum(HOME_SLIDE_LINK_TYPES)
  linkType!: HomeSlideLinkType;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @IsString()
  galleryProductId?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  sponsorLabel?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
