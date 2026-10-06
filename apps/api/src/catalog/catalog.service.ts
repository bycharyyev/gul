import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { UpsertServiceDto } from "./dto/upsert-service.dto";
import type { UpsertRateDto } from "./dto/upsert-rate.dto";
import type { CreatePaymentMethodDto, SetPaymentMethodEnabledDto } from "./dto/set-payment-method-enabled.dto";

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

  /**
   * Turns a payment method on or off for customers. ADR-0005: a new acquirer's method ships
   * disabled and is enabled only after a sandbox payment went through. Refuses a method whose
   * provider is not registered on this node (e.g. FreeKassa without its credentials), because
   * customers would then get "Unknown payment provider" at checkout.
   */
  /**
   * Edits a payment method from the admin console. A method can only be switched on -- or keep
   * running on a different adapter -- when that adapter has its keys on this node; a method whose
   * adapter is missing would send customers to a broken checkout.
   */
  async updatePaymentMethod(
    id: string,
    dto: SetPaymentMethodEnabledDto,
    adminId: string,
    providers: { knows: (key: string) => boolean; has: (key: string) => boolean },
  ) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException("Payment method not found");
    if (dto.provider !== undefined && !providers.knows(dto.provider)) {
      throw new BadRequestException("PAYMENT_PROVIDER_UNKNOWN");
    }
    const provider = dto.provider ?? method.provider;
    const enabled = dto.isEnabled ?? method.isEnabled;
    const switchingOn = dto.isEnabled === true && !method.isEnabled;
    const movingWhileOn = dto.provider !== undefined && dto.provider !== method.provider && enabled;
    if ((switchingOn || movingWhileOn) && !providers.has(provider)) {
      throw new BadRequestException("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }
    const data = {
      ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.provider !== undefined && { provider: dto.provider }),
      ...(dto.feePercent !== undefined && { feePercent: dto.feePercent }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    };
    const updated = await this.prisma.paymentMethod.update({ where: { id }, data });
    this.auditLog.record(adminId, "payment-method.update", "PaymentMethod", id, {
      before: { isEnabled: method.isEnabled, provider: method.provider, name: method.name, feePercent: String(method.feePercent), sortOrder: method.sortOrder },
      changes: data,
    });
    return updated;
  }

  /** A method for a code that has none yet (the code is unique). Starts switched off. */
  async createPaymentMethod(dto: CreatePaymentMethodDto, adminId: string, knows: (key: string) => boolean) {
    if (!knows(dto.provider)) throw new BadRequestException("PAYMENT_PROVIDER_UNKNOWN");
    const exists = await this.prisma.paymentMethod.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException("PAYMENT_METHOD_CODE_TAKEN");
    const created = await this.prisma.paymentMethod.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        provider: dto.provider,
        feePercent: dto.feePercent ?? 0,
        sortOrder: dto.sortOrder ?? 10,
        isEnabled: false,
      },
    });
    this.auditLog.record(adminId, "payment-method.create", "PaymentMethod", created.id, { code: dto.code, provider: dto.provider });
    return created;
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

  /** Every service with its cost percentage, or null where none is set. */
  async listServiceCosts() {
    const services = await this.prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, cost: { select: { costPercent: true, updatedAt: true } } },
    });
    return services.map((s) => ({
      serviceId: s.id,
      code: s.code,
      name: s.name,
      costPercent: s.cost ? Number(s.cost.costPercent) : null,
      updatedAt: s.cost ? s.cost.updatedAt.toISOString() : null,
    }));
  }

  /** Sets (or, with null, clears) a service's cost percentage. Applies to orders created from now
   *  on; existing orders keep the OrderCost frozen at their creation. Audited. */
  async setServiceCost(serviceId: string, costPercent: number | null, adminId: string) {
    await this.getService(serviceId);
    if (costPercent === null) {
      await this.prisma.serviceCost.deleteMany({ where: { serviceId } });
    } else {
      await this.prisma.serviceCost.upsert({
        where: { serviceId },
        create: { serviceId, costPercent, updatedById: adminId },
        update: { costPercent, updatedById: adminId },
      });
    }
    this.auditLog.record(adminId, "service-cost.set", "Service", serviceId, { costPercent });
    return (await this.listServiceCosts()).find((c) => c.serviceId === serviceId);
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
