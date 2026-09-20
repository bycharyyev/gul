import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { PUSH_CATEGORIES, type PushCategory } from "./push-message";

export enum PushPlatformDto {
  ANDROID = "ANDROID",
  IOS = "IOS",
}

export class RegisterPushTokenDto {
  @IsString()
  @Length(20, 4096)
  token!: string;

  @IsEnum(PushPlatformDto)
  platform!: PushPlatformDto;
}

export class PushOpenedDto {
  @IsString()
  @Length(10, 40)
  deliveryId!: string;
}

export class TestPushDto {
  @IsString()
  userId!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsIn(PUSH_CATEGORIES)
  category?: PushCategory;

  @IsOptional()
  @Matches(/^\/(?!\/)/, { message: "route must be an in-app path starting with a single /" })
  @MaxLength(300)
  route?: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, string>;
}
