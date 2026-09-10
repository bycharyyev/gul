import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { EmailSuppressionReason } from "@prisma/client";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { EmailService } from "./email.service";
import { UpdateEmailSettingsDto } from "./dto/update-email-settings.dto";
import { SendTestEmailDto } from "./dto/send-test-email.dto";
import { SendMarketingEmailDto } from "./dto/send-marketing-email.dto";
import { AddSuppressionDto } from "./dto/add-suppression.dto";
import { EmailSuppressionService } from "./email-suppression.service";
import { EmailOutboxService } from "./email-outbox.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@ApiTags("mail")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/mail")
export class EmailController {
  constructor(
    private email: EmailService,
    private suppression: EmailSuppressionService,
    private outbox: EmailOutboxService,
  ) {}

  @Get("settings")
  getSettings() {
    return this.email.getSettings();
  }

  @Patch("settings")
  updateSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.email.updateSettings(dto);
  }

  @Get("logs")
  listLogs(@Query("limit") limit?: string) {
    return this.email.listLogs(limit ? Number(limit) : undefined);
  }

  @Post("test")
  sendTest(@Body() dto: SendTestEmailDto) {
    return this.email.sendTest(dto.toEmail);
  }

  @Roles("ADMIN")
  @Post("marketing")
  sendMarketing(@Body() dto: SendMarketingEmailDto) {
    return this.email.sendMarketingBroadcast(dto.subject, dto.body);
  }

  /**
   * Operational state of the mail pipeline: is SMTP configured and reachable, how much of the
   * day's REG.RU allowance is gone, and how deep each queue is. Never returns the SMTP password
   * or any credential -- only whether one is present.
   */
  @Get("health")
  health() {
    return this.email.health();
  }

  @Get("suppressions")
  listSuppressions(@Query("reason") reason?: EmailSuppressionReason) {
    return this.suppression.list(reason);
  }

  @Roles("ADMIN")
  @Post("suppressions")
  addSuppression(@Body() dto: AddSuppressionDto) {
    return this.suppression.add(dto.email, dto.reason, dto.note);
  }

  @Roles("ADMIN")
  @Delete("suppressions/:email")
  removeSuppression(@Param("email") email: string) {
    return this.suppression.remove(email);
  }

  /** Outbox rows that exhausted their retries — an email that is owed but never went out. */
  @Get("outbox/failed")
  listFailedOutbox() {
    return this.outbox.listFailed();
  }

  @Roles("ADMIN")
  @Post("outbox/:id/retry")
  retryOutbox(@Param("id") id: string) {
    return this.outbox.retry(id);
  }
}
