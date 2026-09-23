import { IsString, Length } from "class-validator";

export class SendMarketingEmailDto {
  @IsString()
  @Length(1, 200)
  subject!: string;

  @IsString()
  @Length(1, 5000)
  body!: string;
}
