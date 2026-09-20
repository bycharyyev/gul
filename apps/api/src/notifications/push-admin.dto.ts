import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { COUNTRY_CODES } from "../common/phone-country";
import { PUSH_CATEGORIES, type PushCategory } from "./push-message";

const ROUTE_PATTERN = /^\/(?!\/)/;
const ROUTE_MESSAGE = "route must be an in-app path starting with a single /";

/** The wording of a push in three languages; Russian is required and is the fallback. */
export class PushContentDto {
  @IsIn(PUSH_CATEGORIES)
  category!: PushCategory;

  @IsString()
  @Length(1, 120)
  titleRu!: string;

  @IsString()
  @Length(1, 500)
  bodyRu!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bodyEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleTkm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bodyTkm?: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @Matches(ROUTE_PATTERN, { message: ROUTE_MESSAGE })
  @MaxLength(300)
  route?: string;
}

export class CreateTemplateDto extends PushContentDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsIn(PUSH_CATEGORIES)
  category?: PushCategory;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  titleRu?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  bodyRu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bodyEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleTkm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bodyTkm?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @Matches(ROUTE_PATTERN, { message: ROUTE_MESSAGE })
  @MaxLength(300)
  route?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * Who receives a campaign.
 *  - ALL: every person with the app installed and signed in.
 *  - FILTER: narrowed by country, language and/or role (a missing list means "any").
 *  - USERS: exactly these accounts.
 */
export class AudienceDto {
  @IsIn(["ALL", "FILTER", "USERS"])
  type!: "ALL" | "FILTER" | "USERS";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(COUNTRY_CODES, { each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(["ru", "en", "tkm"], { each: true })
  locales?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(["CUSTOMER", "SELLER", "SUPPORT", "MANAGER", "ADMIN"], { each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  userIds?: string[];
}

export class CreateCampaignDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  /** Take the wording from a template; anything also given inline overrides it. */
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PushContentDto)
  content?: PushContentDto;

  @ValidateNested()
  @Type(() => AudienceDto)
  audience!: AudienceDto;

  /** Later than now to schedule; omit to keep a draft. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Send immediately instead of drafting or scheduling. */
  @IsOptional()
  @IsBoolean()
  sendNow?: boolean;
}

export class SendOneDto {
  /** An account id, or a phone number in international format. */
  @IsString()
  @Length(3, 40)
  target!: string;

  @ValidateNested()
  @Type(() => PushContentDto)
  content!: PushContentDto;
}
