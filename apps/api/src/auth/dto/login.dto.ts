import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, MaxLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "INVALID_EMAIL" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 72)
  password!: string;
}
