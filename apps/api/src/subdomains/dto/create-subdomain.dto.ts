import { IsInt, IsString, Matches, Max, Min } from "class-validator";

// Only ever a subdomain of the app's own base domain -- provision-subdomain.yml writes an nginx
// vhost + requests a cert for whatever name it's given, so this is the one place stopping an
// admin (or a bug) from pointing that at an arbitrary hostname.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.gulyaly\.pro$/;

export class CreateSubdomainDto {
  @IsString()
  @Matches(SUBDOMAIN_PATTERN, {
    message: "Must be a subdomain of gulyaly.pro, e.g. shop2.gulyaly.pro",
  })
  name!: string;

  @IsInt()
  @Min(1024)
  @Max(65535)
  targetPort!: number;
}
