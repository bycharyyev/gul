import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

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
  @IsObject()
  data?: Record<string, string>;
}
