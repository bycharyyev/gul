import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length } from "class-validator";
import { STORY_LINK_TYPES, type StoryLinkType } from "@topup-hub/types";

export class UpsertStoryDto {
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
  badgeLabel?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  ctaLabel?: string;

  @IsEnum(STORY_LINK_TYPES)
  linkType!: StoryLinkType;

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
