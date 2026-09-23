import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { USER_ROLES, type UserRole } from "@topup-hub/types";

export class CreateStaffUserDto {
  @IsString()
  @Length(6, 20)
  phone!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsEnum(USER_ROLES)
  role!: UserRole;
}
