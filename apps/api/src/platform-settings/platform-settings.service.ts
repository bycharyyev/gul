import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlatformSettingsService {
  constructor(private prisma: PrismaService) {}

  private async ensureRow() {
    return this.prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
  }

  async getTelegramStatus() {
    const row = await this.ensureRow();
    return {
      linked: Boolean(row.adminTelegramChatId),
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    };
  }

  async generateTelegramLinkCode() {
    await this.ensureRow();
    const code = `admin_${randomBytes(12).toString("hex")}`;
    await this.prisma.platformSettings.update({
      where: { id: "singleton" },
      data: { adminTelegramLinkCode: code },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    return {
      code,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    };
  }

  async unlinkTelegram() {
    await this.ensureRow();
    await this.prisma.platformSettings.update({
      where: { id: "singleton" },
      data: { adminTelegramChatId: null, adminTelegramLinkCode: null },
    });
  }
}
