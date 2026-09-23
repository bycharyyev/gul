import { IsEmail, IsString, Length, Matches, MaxLength } from "class-validator";

export class RequestPasswordResetDto {
  @IsEmail({}, { message: "Некорректный email" })
  @MaxLength(254)
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsEmail({}, { message: "Некорректный email" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "Код должен состоять из 6 цифр" })
  code!: string;

  // Same bounds as registration and change-password, so recovery cannot be used to set a
  // password the normal flows would reject.
  @IsString()
  @Length(8, 72)
  newPassword!: string;
}
