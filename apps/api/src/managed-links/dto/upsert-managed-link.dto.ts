import { IsBoolean, IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";

export class UpsertManagedLinkDto {
  // Lowercase letters, digits and hyphens only -- the one thing this endpoint enforces about
  // "the link should be tidy": whatever staff type ends up in a URL, printed on something or
  // pasted into a chat, and a stray space or a capital letter there is a broken link nobody can
  // read out loud correctly either.
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9-]+$/, {
    message: "slug may contain only lowercase letters, digits and hyphens",
  })
  slug!: string;

  // Restricted to http(s): the target is later rendered as a plain redirect and an `<a href>` in
  // the admin list, and a `javascript:` URL there would be a stored-XSS vector rather than a link.
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  targetUrl!: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
