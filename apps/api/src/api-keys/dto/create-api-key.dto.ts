import { ArrayUnique, IsArray, IsIn, IsISO8601, IsOptional, IsString, Length } from "class-validator";
import { API_KEY_SCOPES } from "../../partner/api-key-scopes";

export class CreateApiKeyDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 120)
  ownerLabel!: string;

  /**
   * What the key may do. Omitted means `["catalog:read"]` -- the narrowest useful default, so a
   * key that nobody thought about cannot create orders.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes?: string[];

  /** ISO date. Omitted means the key never expires. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
