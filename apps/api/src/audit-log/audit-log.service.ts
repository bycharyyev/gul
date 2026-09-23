import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  /** Fire-and-forget by design: an audit-log write failing must never break the admin action
   *  it's recording. Logged locally so a persistent failure is still visible somewhere. */
  record(adminId: string, action: string, entityType: string, entityId: string, meta?: object) {
    this.prisma.auditLog
      .create({ data: { adminId, action, entityType, entityId, meta } })
      .catch((err) => this.logger.error(`Failed to write audit log (${action} ${entityType}:${entityId})`, err));
  }
}
