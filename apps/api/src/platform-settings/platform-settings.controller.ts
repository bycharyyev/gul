import { Controller, Delete, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PlatformSettingsService } from "./platform-settings.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@ApiTags("platform-settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/platform-settings")
export class PlatformSettingsController {
  constructor(private platformSettings: PlatformSettingsService) {}

  @Get("telegram")
  getTelegramStatus() {
    return this.platformSettings.getTelegramStatus();
  }

  @Post("telegram/link-code")
  generateTelegramLinkCode() {
    return this.platformSettings.generateTelegramLinkCode();
  }

  @HttpCode(204)
  @Delete("telegram")
  unlinkTelegram() {
    return this.platformSettings.unlinkTelegram();
  }
}
