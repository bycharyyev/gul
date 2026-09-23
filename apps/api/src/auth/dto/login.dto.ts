import { IsString, Length } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(6, 20)
  phone!: string;

  @IsString()
  @Length(1, 72)
  password!: string;
}
