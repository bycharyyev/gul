import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { UploadCleanupService } from "../storage/upload-cleanup.service";
import type { UpdateAssistantSettingsDto } from "./dto/update-assistant-settings.dto";

const SINGLETON = "singleton";

@Injectable()
export class AssistantSettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private uploadCleanup: UploadCleanupService,
  ) {}

  private async ensureRow() {
    return this.prisma.assistantSettings.upsert({
      where: { id: SINGLETON },
      update: {},
      create: { id: SINGLETON },
    });
  }

  async get() {
    const row = await this.ensureRow();
    return { logoUrl: row.logoUrl, name: row.name, statusText: row.statusText };
  }

  async update(dto: UpdateAssistantSettingsDto, adminId: string) {
    const before = await this.ensureRow();
    const row = await this.prisma.assistantSettings.update({
      where: { id: SINGLETON },
      data: {
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl || null } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.statusText !== undefined ? { statusText: dto.statusText.trim() } : {}),
      },
    });
    await this.uploadCleanup.removeIfReplaced(before.logoUrl, row.logoUrl);
    this.auditLog.record(adminId, "assistant-settings.update", "AssistantSettings", SINGLETON, {
      logoChanged: before.logoUrl !== row.logoUrl,
      name: row.name,
      statusText: row.statusText,
    });
    return { logoUrl: row.logoUrl, name: row.name, statusText: row.statusText };
  }
}
