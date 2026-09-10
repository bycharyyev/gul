import { IsBoolean, IsOptional } from "class-validator";

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsBoolean()
  transactionalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEnabled?: boolean;
}
