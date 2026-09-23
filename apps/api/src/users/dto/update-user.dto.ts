import { IsBoolean, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { USER_ROLES, type UserRole } from "@topup-hub/types";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
