import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { UpsertServiceDto } from "./dto/upsert-service.dto";
import type { UpsertRateDto } from "./dto/upsert-rate.dto";

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  listServices(includeDisabled = false) {
    return this.prisma.service.findMany({
      where: includeDisabled ? undefined : { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async getService(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  listRates(serviceId: string, includeDisabled = false) {
    return this.prisma.rate.findMany({
      where: { serviceId, ...(includeDisabled ? {} : { enabled: true }) },
    });
  }

  listPaymentMethods(includeDisabled = false) {
    return this.prisma.paymentMethod.findMany({
      where: includeDisabled ? undefined : { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  // ---- Admin mutations ----

  createService(dto: UpsertServiceDto) {
    if (dto.minAmountTmt > dto.maxAmountTmt) {
      throw new BadRequestException("minAmountTmt must be <= maxAmountTmt");
    }
    return this.prisma.service.create({ data: dto });
  }

  async updateService(id: string, dto: Partial<UpsertServiceDto>) {
    const existing = await this.getService(id);
    const min = dto.minAmountTmt ?? Number(existing.minAmountTmt);
    const max = dto.maxAmountTmt ?? Number(existing.maxAmountTmt);
    if (min > max) throw new BadRequestException("minAmountTmt must be <= maxAmountTmt");
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async upsertRate(serviceId: string, dto: UpsertRateDto, adminId: string) {
    await this.getService(serviceId);
    const rate = await this.prisma.rate.upsert({
      where: { serviceId_currency: { serviceId, currency: dto.currency } },
      create: { serviceId, ...dto, updatedById: adminId },
      update: { ...dto, updatedById: adminId },
    });
    this.auditLog.record(adminId, "rate.upsert", "Rate", rate.id, { serviceId, ...dto });
    return rate;
  }

  async deleteService(id: string) {
    await this.getService(id);
    const orderCount = await this.prisma.order.count({ where: { serviceId: id } });
    if (orderCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${orderCount} order(s) reference this service. Disable it instead.`,
      );
    }
    await this.prisma.rate.deleteMany({ where: { serviceId: id } });
    await this.prisma.service.delete({ where: { id } });
  }
}
