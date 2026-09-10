import { IsEmail, IsString, Length, Matches } from "class-validator";

export class RequestEmailVerificationDto {
  @IsEmail({}, { message: "Некорректный email" })
  @Length(3, 254)
  email!: string;
}

export class ConfirmEmailVerificationDto {
  // Exactly six digits -- matches the generated code, and rejects obvious garbage before it
  // costs an attempt against the stored code.
  @IsString()
  @Matches(/^\d{6}$/, { message: "Код должен состоять из 6 цифр" })
  code!: string;
}
