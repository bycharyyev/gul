import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches } from "class-validator";

/**
 * A shop application filed by somebody who is already signed in.
 *
 * Deliberately carries no phone and no password: both come from the session. The public form has
 * to ask for them because the applicant has no account yet, but accepting them here would mean a
 * signed-in person could file an application naming *somebody else's* phone — and an approval
 * would then land on that stranger's account. Identity that is already proven must not be
 * re-supplied from a request body.
 */
export class ApplyAsMeDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-z0-9_]+$/, {
    message: "handle may only contain lowercase letters, digits, and underscores",
  })
  handle!: string;

  @IsString()
  @Length(1, 120)
  shopName!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
