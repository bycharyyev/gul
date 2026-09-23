import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Length } from "class-validator";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@topup-hub/types";

export class UpsertSocialLinkDto {
  @IsEnum(SOCIAL_PLATFORMS)
  platform!: SocialPlatform;

  @IsString()
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
