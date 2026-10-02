import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { USER_ROLES, type UserRole } from "@topup-hub/types";

export class CreateStaffUserDto {
  /** The staff member signs in with this address. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "INVALID_EMAIL" })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

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
