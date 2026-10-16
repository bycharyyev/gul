import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertSocialLinkDto } from "./dto/upsert-social-link.dto";
import { normalizeSocialUrl } from "./social-url";

@Injectable()
export class SocialLinksService {
  constructor(private prisma: PrismaService) {}

  listActive() {
    return this.prisma.socialLink.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  listAll() {
    return this.prisma.socialLink.findMany({ orderBy: { sortOrder: "asc" } });
  }

  createLink(dto: UpsertSocialLinkDto) {
    return this.prisma.socialLink.create({
      data: { ...dto, url: normalizeSocialUrl(dto.platform, dto.url) },
    });
  }

  async updateLink(id: string, dto: Partial<UpsertSocialLinkDto>) {
    const existing = await this.getLinkOrThrow(id);
    const data =
      dto.url === undefined
        ? dto
        : { ...dto, url: normalizeSocialUrl(dto.platform ?? existing.platform, dto.url) };
    return this.prisma.socialLink.update({ where: { id }, data });
  }

  async deleteLink(id: string) {
    await this.getLinkOrThrow(id);
    await this.prisma.socialLink.delete({ where: { id } });
  }

  private async getLinkOrThrow(id: string) {
    const link = await this.prisma.socialLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Social link not found");
    return link;
  }
}
