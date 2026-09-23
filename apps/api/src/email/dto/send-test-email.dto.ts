import { IsEmail } from "class-validator";

export class SendTestEmailDto {
  @IsEmail()
  toEmail!: string;
}
