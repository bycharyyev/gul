import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAnalyticsLinkDto } from "./dto/create-analytics-link.dto";

@Injectable()
export class AnalyticsLinksService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.analyticsLink.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  create(dto: CreateAnalyticsLinkDto) {
    const url = new URL(dto.url);
    return this.prisma.analyticsLink.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        url: url.toString(),
        faviconUrl: new URL("/favicon.ico", url.origin).toString(),
      },
    });
  }

  async remove(id: string) {
    const link = await this.prisma.analyticsLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Analytics link not found");
    await this.prisma.analyticsLink.delete({ where: { id } });
  }
}
