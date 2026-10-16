import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AssistantSettingsService } from "./assistant-settings.service";
import { UpdateAssistantSettingsDto } from "./dto/update-assistant-settings.dto";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { InvalidatesPublicCache } from "../public-cache/invalidates-public-cache.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

/** Public read of the assistant's look. Cached briefly and dropped on every admin save. */
@ApiTags("assistant-settings")
@Controller("assistant-settings")
export class AssistantSettingsPublicController {
  constructor(
    private settings: AssistantSettingsService,
    private cache: PublicCacheService,
  ) {}

  @Get()
  get() {
    return this.cache.wrap("content", "assistant", {}, 300, () => this.settings.get());
  }
}

@ApiTags("admin-assistant-settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/assistant-settings")
export class AssistantSettingsAdminController {
  constructor(private settings: AssistantSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  @InvalidatesPublicCache("content")
  update(@Body() dto: UpdateAssistantSettingsDto, @CurrentUser() user: AuthedUser) {
    return this.settings.update(dto, user.userId);
  }
}
