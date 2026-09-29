import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MarketplaceSettingsService } from "./marketplace-settings.service";
import { UpdateMarketplaceSettingsDto } from "./dto/update-marketplace-settings.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("admin-marketplace-settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/marketplace-settings")
export class MarketplaceSettingsController {
  constructor(private marketplaceSettings: MarketplaceSettingsService) {}

  @Get()
  getSettings() {
    return this.marketplaceSettings.getSettings();
  }

  /// Changing the take rate is an ADMIN-only decision (unlike reading it, which MANAGER can also
  /// do) -- it moves money away from every seller's future sale. Recorded via AuditLogService,
  /// same as ReferralsService.updateSettings.
  @Roles("ADMIN")
  @Patch()
  updateSettings(@Body() dto: UpdateMarketplaceSettingsDto, @CurrentUser() user: AuthedUser) {
    return this.marketplaceSettings.updateSettings(dto, user.userId);
  }
}
