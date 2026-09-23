import { IsBoolean, IsOptional } from "class-validator";

/**
 * Only the optional categories are settable. Transactional and security mail is deliberately
 * absent: it is not something a user can switch off while holding an account.
 */
export class UpdateEmailPreferenceDto {
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  partnerOffers?: boolean;
}
