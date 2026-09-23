import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertManagedLinkDto } from "./dto/upsert-managed-link.dto";

@Injectable()
export class ManagedLinksService {
  constructor(private prisma: PrismaService) {}

  listAll() {
    return this.prisma.managedLink.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getById(id: string) {
    const link = await this.prisma.managedLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    return link;
  }

  /**
   * Where the redirect actually resolves. Public, and counts as a visit -- the click number in
   * the admin list is read from here, not from a separate analytics call nobody would remember
   * to wire up.
   *
   * A disabled link 404s exactly like one that was never created: staff pausing a campaign should
   * not leave a link that still resolves but goes nowhere useful.
   */
  async resolve(slug: string) {
    const link = await this.prisma.managedLink.findUnique({ where: { slug } });
    if (!link || !link.isEnabled) throw new NotFoundException("Link not found");
    await this.prisma.managedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });
    return link;
  }

  async create(dto: UpsertManagedLinkDto) {
    const existing = await this.prisma.managedLink.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException("A link with this slug already exists");
    return this.prisma.managedLink.create({ data: dto });
  }

  async update(id: string, dto: Partial<UpsertManagedLinkDto>) {
    const link = await this.getById(id);
    if (dto.slug && dto.slug !== link.slug) {
      const existing = await this.prisma.managedLink.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException("A link with this slug already exists");
    }
    return this.prisma.managedLink.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.managedLink.delete({ where: { id } });
  }
}
