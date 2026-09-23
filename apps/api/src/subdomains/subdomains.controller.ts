import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SubdomainsService } from "./subdomains.service";
import { CreateSubdomainDto } from "./dto/create-subdomain.dto";
import { ReportSubdomainStatusDto } from "./dto/report-subdomain-status.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { timingSafeEqual } from "node:crypto";

type AuthedUser = { userId: string; role: string };

// Plain `===` leaks timing information proportional to how many leading bytes match --
// negligible over one noisy HTTP round-trip, but the wrong pattern to have on file. Both
// buffers must be equal length for timingSafeEqual to run at all, so pad/compare via a
// fixed-size hash instead of the raw strings (which may differ in length).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@ApiTags("subdomains")
@Controller("admin/subdomains")
export class SubdomainsController {
  constructor(
    private subdomains: SubdomainsService,
    private config: ConfigService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get()
  listAll() {
    return this.subdomains.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post()
  create(@Body() dto: CreateSubdomainDto, @CurrentUser() user: AuthedUser) {
    return this.subdomains.create(dto, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.subdomains.remove(id, user.userId);
  }

  // Called by provision-subdomain.yml when it finishes -- not a logged-in admin, so it's gated
  // by a shared secret header instead of JWT. No secret configured means this stays disabled.
  @HttpCode(204)
  @Post("callback")
  async callback(@Headers("x-provision-secret") secret: string | undefined, @Body() dto: ReportSubdomainStatusDto) {
    const expected = this.config.get<string>("PROVISION_CALLBACK_SECRET");
    if (!expected) throw new BadRequestException("Provisioning callback is not configured");
    if (!secret || !safeEqual(secret, expected)) throw new ForbiddenException();
    await this.subdomains.reportStatus(dto.name, dto.status, dto.lastError);
  }
}
