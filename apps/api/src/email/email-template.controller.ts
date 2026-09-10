import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { EmailKind, EmailTemplateStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EMAIL_KINDS } from "./email-kinds";
import { EmailTemplateService } from "./email-template.service";
import { SaveEmailTemplateDto } from "./dto/email-template.dto";

/**
 * Template management for staff. Editing is ADMIN-only and never mutates a live template:
 * every save creates a new DRAFT version, and activating one archives whichever version was
 * previously serving, so content that mail has already been sent against stays intact.
 */
@ApiTags("mail")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/mail/templates")
export class EmailTemplateController {
  constructor(
    private templates: EmailTemplateService,
    private audit: AuditLogService,
  ) {}

  /** The variables and sender/consent rules each kind carries, for the editor's help panel. */
  @Get("kinds")
  kinds() {
    return Object.entries(EMAIL_KINDS).map(([kind, spec]) => ({ kind, ...spec }));
  }

  @Get()
  list(
    @Query("kind") kind?: EmailKind,
    @Query("locale") locale?: string,
    @Query("status") status?: EmailTemplateStatus,
  ) {
    return this.templates.list({ kind, locale, status });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.templates.get(id);
  }

  @Get(":id/preview")
  preview(@Param("id") id: string) {
    return this.templates.preview(id);
  }

  @Roles("ADMIN")
  @Post()
  async save(@Body() dto: SaveEmailTemplateDto, @CurrentUser() user: { userId: string }) {
    const created = await this.templates.createVersion(
      dto.kind,
      dto.locale,
      { subject: dto.subject, preheader: dto.preheader, html: dto.html, text: dto.text },
      user.userId,
    );
    this.audit.record(user.userId, "email_template.created", "EmailTemplate", created.id, {
      kind: dto.kind,
      locale: dto.locale,
      version: created.version,
    });
    return created;
  }

  @Roles("ADMIN")
  @Post(":id/activate")
  async activate(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    const activated = await this.templates.activate(id);
    this.audit.record(user.userId, "email_template.activated", "EmailTemplate", activated.id, {
      kind: activated.kind,
      locale: activated.locale,
      version: activated.version,
    });
    return activated;
  }

  @Roles("ADMIN")
  @Post(":id/archive")
  async archive(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    const archived = await this.templates.archive(id);
    this.audit.record(user.userId, "email_template.archived", "EmailTemplate", archived.id, {
      kind: archived.kind,
      locale: archived.locale,
      version: archived.version,
    });
    return archived;
  }
}
