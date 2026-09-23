import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AnalyticsLinksService } from "./analytics-links.service";
import { CreateAnalyticsLinkDto } from "./dto/create-analytics-link.dto";

@ApiTags("analytics-links")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("analytics-links")
export class AnalyticsLinksController {
  constructor(private links: AnalyticsLinksService) {}

  @Get()
  list() {
    return this.links.list();
  }

  @Post()
  create(@Body() dto: CreateAnalyticsLinkDto) {
    return this.links.create(dto);
  }

  @Roles("ADMIN")
  @HttpCode(204)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.links.remove(id);
  }
}
