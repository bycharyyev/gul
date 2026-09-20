import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { RegisterPushTokenDto, TestPushDto } from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("devices")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  register(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.notifications.register(user.userId, dto.token, dto.platform);
  }

  @Delete("devices/:token")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  remove(
    @CurrentUser() user: { userId: string },
    @Param("token") token: string,
  ) {
    return this.notifications.remove(user.userId, token);
  }

  @Post("test")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  test(@Body() dto: TestPushDto) {
    return this.notifications.sendToUser(dto.userId, {
      category: dto.category ?? "orders",
      title: dto.title,
      body: dto.body,
      route: dto.route ?? "/home",
      imageUrl: dto.imageUrl,
      data: dto.data,
    });
  }
}
