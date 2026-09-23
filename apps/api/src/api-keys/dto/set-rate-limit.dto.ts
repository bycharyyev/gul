import { IsInt, IsOptional, Max, Min } from "class-validator";

export class SetRateLimitDto {
  /**
   * Requests per minute. Omitted or null returns the key to the partner tier default.
   *
   * The floor of 1 is what stops a typo from silently disabling a partner: setting 0 would read
   * as "no limit" to a person and mean "reject everything" to the code. Disabling a key is what
   * `isEnabled` is for, and it says so.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  rateLimitPerMin?: number | null;
}
