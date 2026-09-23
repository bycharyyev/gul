import { Injectable, Logger } from "@nestjs/common";
import type { EmailSuppressionReason } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Addresses we must stop sending to.
 *
 * Populated automatically from permanent SMTP rejections (a 5xx naming the recipient is the
 * closest thing to bounce information REG.RU gives us -- they expose no bounce webhook or API),
 * and manually by staff. Checked for marketing and ordinary transactional mail, deliberately
 * NOT for authentication or security mail: see EMAIL_KINDS.respectsSuppression.
 */
@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);

  constructor(private prisma: PrismaService) {}

  list(reason?: EmailSuppressionReason) {
    return this.prisma.emailSuppression.findMany({
      where: reason ? { reason } : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  /**
   * Idempotent: the first reason recorded for an address wins. A later duplicate must not
   * overwrite a HARD_BOUNCE with, say, an UNSUBSCRIBED, because the two carry different weight
   * when deciding whether the address can ever be used again.
   */
  async add(email: string, reason: EmailSuppressionReason, note?: string) {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.emailSuppression.findUnique({ where: { email: normalized } });
    if (existing) return existing;

    this.logger.log(`Suppressing address (reason=${reason})`);
    return this.prisma.emailSuppression.create({ data: { email: normalized, reason, note } });
  }

  /** Staff removing an address they judge to be deliverable again. */
  async remove(email: string) {
    const normalized = email.trim().toLowerCase();
    await this.prisma.emailSuppression.deleteMany({ where: { email: normalized } });
    return { email: normalized, removed: true };
  }

  async isSuppressed(email: string): Promise<boolean> {
    const row = await this.prisma.emailSuppression.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    return !!row;
  }
}
