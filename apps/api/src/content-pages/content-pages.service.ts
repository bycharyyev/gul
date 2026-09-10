import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertContentPageDto } from "./dto/upsert-content-page.dto";

@Injectable()
export class ContentPagesService {
  constructor(private prisma: PrismaService) {}

  listAll() {
    return this.prisma.contentPage.findMany({ orderBy: { slug: "asc" } });
  }

  async getBySlug(slug: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException("Page not found");
    return page;
  }

  async getById(id: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("Page not found");
    return page;
  }

  async create(dto: UpsertContentPageDto) {
    const existing = await this.prisma.contentPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException("Page with this slug already exists");
    return this.prisma.contentPage.create({ data: dto });
  }

  async update(id: string, dto: Partial<UpsertContentPageDto>) {
    const page = await this.getById(id);
    if (dto.slug && dto.slug !== page.slug) {
      const existing = await this.prisma.contentPage.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException("Page with this slug already exists");
    }
    return this.prisma.contentPage.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.contentPage.delete({ where: { id } });
  }
}
