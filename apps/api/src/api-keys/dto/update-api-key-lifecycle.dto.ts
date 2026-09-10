import { ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";
import { API_KEY_SCOPES } from "../../partner/api-key-scopes";

export class SetScopesDto {
  /** The complete list. Replacing rather than adding keeps "what can this key do" answerable. */
  @IsArray()
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes!: string[];
}

export class SetExpiryDto {
  /** ISO date, or null for "never expires". */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

export class RotateApiKeyDto {
  /**
   * How long the outgoing secret keeps working. Default 24h: long enough for a partner to deploy
   * during a working day, short enough that a leaked key is not usable for a week.
   *
   * 0 is allowed and means "cut the old key immediately" -- the right choice when rotating
   * *because* the old one leaked.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  graceHours?: number;
}
