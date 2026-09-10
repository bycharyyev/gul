import { IsString, Length } from "class-validator";

export class UpdateUsernameDto {
  @IsString()
  @Length(2, 32)
  username!: string;
}
