import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export enum SocialMediaDtoType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
}
export enum SocialPostModerationDtoStatus {
  PENDING = "PENDING",
  PUBLISHED = "PUBLISHED",
  REJECTED = "REJECTED",
  HIDDEN = "HIDDEN",
}
export enum SocialCommentModerationDtoStatus {
  PENDING = "PENDING",
  PUBLISHED = "PUBLISHED",
  HIDDEN = "HIDDEN",
}

export class CreateSocialPostDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1500) body?: string;
  @IsEnum(SocialMediaDtoType) mediaType!: SocialMediaDtoType;
  @ValidateIf(
    (o: CreateSocialPostDto) => o.mediaType !== SocialMediaDtoType.TEXT,
  )
  @Matches(/^(https:\/\/|\/api\/uploads\/)/)
  mediaUrl?: string;
  @ValidateIf(
    (o: CreateSocialPostDto) => o.mediaType === SocialMediaDtoType.VIDEO,
  )
  @Matches(/^(https:\/\/|\/api\/uploads\/)/)
  thumbnailUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  productIds: string[] = [];
}

export class UpdateSocialPostDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1500) body?: string;
  @IsOptional() @IsEnum(SocialMediaDtoType) mediaType?: SocialMediaDtoType;
  @IsOptional() @Matches(/^(https:\/\/|\/api\/uploads\/)/) mediaUrl?: string;
  @IsOptional()
  @Matches(/^(https:\/\/|\/api\/uploads\/)/)
  thumbnailUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  productIds?: string[];
}
export class CreateSocialCommentDto {
  @IsString() @MinLength(1) @MaxLength(600) body!: string;
}
export class ReportSocialPostDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class ModerateSocialPostDto {
  @IsEnum(SocialPostModerationDtoStatus) status!: SocialPostModerationDtoStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class ModerateSocialCommentDto {
  @IsEnum(SocialCommentModerationDtoStatus)
  status!: SocialCommentModerationDtoStatus;
}
