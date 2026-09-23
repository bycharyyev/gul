import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { SHOP_SCOPES } from "../../partner/api-key-scopes";

export class CreateSellerKeyDto {
  /** What this token is for, in the seller's own words: "Мой сайт", "Синхронизация 1С". */
  @IsString()
  @Length(1, 120)
  name!: string;

  /**
   * What the token may do. Shop scopes only -- a seller cannot mint themselves a partner key by
   * asking for `catalog:read` here.
   *
   * Omitted means read-only. A token nobody thought about should be able to look, not to delete.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(SHOP_SCOPES, { each: true })
  scopes?: string[];

  /** ISO date. Omitted means the token never expires. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
