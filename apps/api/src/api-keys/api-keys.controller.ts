import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { SetRateLimitDto } from "./dto/set-rate-limit.dto";
import {
  RotateApiKeyDto,
  SetExpiryDto,
  SetScopesDto,
} from "./dto/update-api-key-lifecycle.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("api-keys")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("admin/api-keys")
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  @Get()
  list() {
    return this.apiKeys.list();
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: { userId: string }) {
    return this.apiKeys.create(dto, user.userId);
  }

  @Patch(":id")
  setEnabled(@Param("id") id: string, @Body("isEnabled") isEnabled: boolean) {
    return this.apiKeys.setEnabled(id, isEnabled);
  }

  @Patch(":id/rate-limit")
  setRateLimit(@Param("id") id: string, @Body() dto: SetRateLimitDto) {
    return this.apiKeys.setRateLimit(id, dto.rateLimitPerMin ?? null);
  }

  @Patch(":id/scopes")
  setScopes(@Param("id") id: string, @Body() dto: SetScopesDto) {
    return this.apiKeys.setScopes(id, dto.scopes);
  }

  @Patch(":id/expiry")
  setExpiry(@Param("id") id: string, @Body() dto: SetExpiryDto) {
    return this.apiKeys.setExpiry(id, dto.expiresAt ?? null);
  }

  /** Returns the new raw key exactly once, like creation does. */
  @Post(":id/rotate")
  rotate(@Param("id") id: string, @Body() dto: RotateApiKeyDto) {
    return this.apiKeys.rotate(id, dto.graceHours ?? 24);
  }

  @HttpCode(204)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.apiKeys.remove(id);
  }
}
