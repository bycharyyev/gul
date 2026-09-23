import { IsIn } from "class-validator";

export class UpdateLocaleDto {
  @IsIn(["ru", "en", "tkm"])
  locale!: string;
}
