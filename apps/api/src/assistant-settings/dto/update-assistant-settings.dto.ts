import { IsOptional, IsString, MaxLength, Matches } from "class-validator";

// Every field optional, so the admin can save one without resending the others. A logo is either
// an https address or one of our own local-fallback uploads; anything else is refused.
export class UpdateAssistantSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https:\/\/|\/api\/uploads\/)/, { message: "logoUrl must be an https or uploads URL" })
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  statusText?: string;
}
