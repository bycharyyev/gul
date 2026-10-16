import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length } from "class-validator";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@topup-hub/types";

export class UpsertSocialLinkDto {
  @IsEnum(SOCIAL_PLATFORMS)
  platform!: SocialPlatform;

  // A full link or a bare profile name; normalizeSocialUrl turns it into the stored link.
  @IsString()
  @Length(1, 300)
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
