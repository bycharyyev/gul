import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EmailService } from "../email/email.service";
import { SHIPMENT_STATUS_TRANSITIONS } from "./cargo.constants";
import type { CreateQuoteDto } from "./dto/create-quote.dto";
import type { CreateShipmentDto } from "./dto/create-shipment.dto";
import type { CreatePickupRequestDto } from "./dto/create-pickup-request.dto";
import type { UpdateShipmentStatusDto } from "./dto/update-shipment-status.dto";
import type { CreateCityDto, UpdateCityDto } from "./dto/upsert-city.dto";
import type { UpsertItemTypeDto } from "./dto/upsert-item-type.dto";
import type { UpsertBannerDto } from "./dto/upsert-banner.dto";
import type { SetTariffBracketsDto } from "./dto/create-tariff.dto";
import type { UpdateExchangeRateDto } from "./dto/update-exchange-rate.dto";
import type { CargoCity, CargoItemType, Prisma, Shipment, ShipmentStatus } from "@prisma/client";
import { canTransition } from "../common/state-machine";

type DecimalInput = Prisma.Decimal | number | string;

const SAFE_USER_SELECT = { id: true, phone: true, fullName: true } as const;
const EXCHANGE_RATE_ID = "singleton";

const SHIPMENT_INCLUDE = {
  originCity: true,
  destinationCity: true,
  itemType: true,
  tariff: true,
  paymentMethod: true,
  pickup: true,
  trackingEvents: {
    orderBy: { createdAt: "asc" as const },
    include: { createdBy: { select: SAFE_USER_SELECT } },
  },
} as const;

const ADMIN_LIST_INCLUDE = {
  originCity: true,
  destinationCity: true,
  itemType: true,
  user: { select: SAFE_USER_SELECT },
} as const;

interface RubBracket {
  id: string;
  minWeightKg: DecimalInput;
  pricePerKgRub: DecimalInput;
  pickupFeeRub: DecimalInput;
}

interface FxRate {
  rubPerUsd: DecimalInput;
  tmtPerUsd: DecimalInput;
}

@Injectable()
export class CargoService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private email: EmailService,
  ) {}

  // ---------------------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------------------

  /** Weight-break pricing: the whole shipment is priced at whichever bracket its total declared
   *  weight falls into (confirmed real figures: 140 RUB/kg under 50kg, 130 from 50kg, 120 from
   *  100kg) -- not a progressive per-kg blend across brackets. */
  private computeTotalRub(weightKg: number, bracket: RubBracket): number {
    const total = weightKg * Number(bracket.pricePerKgRub) + Number(bracket.pickupFeeRub);
    return Math.round(total * 100) / 100;
  }

  /** Counted goods (phones, medicines) ignore weight entirely -- they travel a separate route and
   *  the partner quotes per unit. The pickup fee still applies once per shipment, not per item. */
  private computeItemTotalRub(quantity: number, pricePerItemRub: number, pickupFeeRub: number): number {
    return Math.round((quantity * pricePerItemRub + pickupFeeRub) * 100) / 100;
  }

  /** The single place a Cargo price is decided, for either pricing unit. Everything a caller could
   *  have lied about (price, bracket, per-item rate) is re-read from the database here; the caller
   *  only ever supplies weight or quantity. */
  private async priceShipment(itemType: CargoItemType, input: { declaredWeightKg?: number | null; quantity?: number | null }) {
    const fx = await this.getExchangeRate();
    const pickupFeeRub = Number((await this.getPickupFeeBracket()).pickupFeeRub);

    if (itemType.pricingUnit === "PER_ITEM") {
      const quantity = Math.trunc(input.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new BadRequestException("quantity must be at least 1 for this cargo type");
      }
      if (itemType.pricePerItemRub === null) {
        throw new BadRequestException("This cargo type has no per-item price configured yet");
      }
      const pricePerItemRub = Number(itemType.pricePerItemRub);
      const totalPriceRub = this.computeItemTotalRub(quantity, pricePerItemRub, pickupFeeRub);
      return {
        fx,
        bracket: null,
        quantity,
        declaredWeightKg: null,
        pricePerItemRub,
        pickupFeeRub,
        totalPriceRub,
        totalPriceTmt: this.rubToTmt(totalPriceRub, fx),
      };
    }

    const weightKg = input.declaredWeightKg ?? 0;
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new BadRequestException("declaredWeightKg is required for this cargo type");
    }
    // The partner refuses anything under this, so reject it here rather than at the warehouse.
    const minWeightKg = itemType.minWeightKg === null ? 0 : Number(itemType.minWeightKg);
    if (weightKg < minWeightKg) {
      throw new BadRequestException(`Minimum weight for this cargo type is ${minWeightKg} kg`);
    }
    const bracket = await this.getBracketForWeight(weightKg);
    const totalPriceRub = this.computeTotalRub(weightKg, bracket);
    return {
      fx,
      bracket,
      quantity: 1,
      declaredWeightKg: weightKg,
      pricePerItemRub: null,
      pickupFeeRub: Number(bracket.pickupFeeRub),
      totalPriceRub,
      totalPriceTmt: this.rubToTmt(totalPriceRub, fx),
    };
  }

  /** RUB and TMT both float against USD independently, so this goes through the USD cross-rates
   *  rather than a single stored RUB->TMT number that would silently go stale the moment only one
   *  of the two currencies moves -- see CargoExchangeRate's schema comment. */
  private rubToTmt(rub: number, fx: FxRate): number {
    const usd = rub / Number(fx.rubPerUsd);
    return Math.round(usd * Number(fx.tmtPerUsd) * 100) / 100;
  }

  /** Origin and destination are independent: any enabled origin can reach any enabled destination,
   *  so this validates the two ends separately rather than looking up a pair. */
  private async getCityOrThrow(id: string, role: "ORIGIN" | "DESTINATION"): Promise<CargoCity> {
    const city = await this.prisma.cargoCity.findUnique({ where: { id } });
    if (!city || !city.isEnabled || city.role !== role) {
      throw new NotFoundException(role === "ORIGIN" ? "Origin city not available" : "Destination city not available");
    }
    return city;
  }

  private async getItemTypeOrThrow(id: string): Promise<CargoItemType> {
    const itemType = await this.prisma.cargoItemType.findUnique({ where: { id } });
    if (!itemType || !itemType.isEnabled) throw new NotFoundException("Cargo type not available");
    return itemType;
  }

  /** The pickup fee lives on the weight brackets and is the same across them in practice, but a
   *  counted shipment has no bracket -- take it from the lowest one so per-item and per-kg
   *  shipments are charged the same pickup, from one admin-editable place. */
  private async getPickupFeeBracket(): Promise<{ pickupFeeRub: DecimalInput }> {
    const bracket = await this.prisma.cargoTariff.findFirst({
      where: { isActive: true },
      orderBy: { minWeightKg: "asc" },
    });
    return bracket ?? { pickupFeeRub: 0 };
  }

  /** The one thing every price is actually computed from -- never trust a client-supplied price.
   *  Re-fetched fresh at both /quote and shipment creation; the shipment then snapshots what it
   *  found so a later bracket or exchange-rate edit never rewrites an order already placed. */
  private async getBracketForWeight(weightKg: number): Promise<RubBracket> {
    const brackets = await this.prisma.cargoTariff.findMany({
      where: { isActive: true, minWeightKg: { lte: weightKg } },
      orderBy: { minWeightKg: "desc" },
      take: 1,
    });
    const bracket = brackets[0];
    if (!bracket) throw new BadRequestException("No tariff bracket covers this weight yet");
    return bracket;
  }

  private async getExchangeRate(): Promise<FxRate> {
    const fx = await this.prisma.cargoExchangeRate.findUnique({ where: { id: EXCHANGE_RATE_ID } });
    if (!fx) throw new BadRequestException("Exchange rates are not configured yet");
    return fx;
  }

  private async nextTrackingNumber(): Promise<string> {
    // Same lock-free sequence approach as ReferralsService.generateUsername() -- concurrent
    // shipment creation can't collide, no application-level locking needed.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
      `SELECT nextval('cargo_tracking_seq') AS value`,
    );
    const year = new Date().getFullYear();
    return `CRG-${year}-${String(rows[0].value).padStart(6, "0")}`;
  }

  // ---------------------------------------------------------------------------
  // Customer
  // ---------------------------------------------------------------------------

  /** Everything a client needs to render the form: both city lists and the priced cargo types.
   *  Deliberately one call -- the old /routes returned pairs, and a client that had to fan out to
   *  three endpoints to draw one form would show it half-populated on a slow connection. */
  async listDirections() {
    const [origins, destinations, itemTypes, brackets] = await Promise.all([
      this.prisma.cargoCity.findMany({
        where: { role: "ORIGIN", isEnabled: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.cargoCity.findMany({
        where: { role: "DESTINATION", isEnabled: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.cargoItemType.findMany({
        where: { isEnabled: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.cargoTariff.findMany({
        where: { isActive: true },
        orderBy: { minWeightKg: "asc" },
      }),
    ]);
    return {
      origins,
      destinations,
      itemTypes: itemTypes.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        pricingUnit: t.pricingUnit,
        pricePerItemRub: t.pricePerItemRub === null ? null : Number(t.pricePerItemRub),
        minWeightKg: t.minWeightKg === null ? null : Number(t.minWeightKg),
      })),
      // Lets a client show "from N TMT/kg" and the bracket table without a second round trip.
      weightBrackets: brackets.map((b) => ({
        minWeightKg: Number(b.minWeightKg),
        pricePerKgRub: Number(b.pricePerKgRub),
        pickupFeeRub: Number(b.pickupFeeRub),
      })),
    };
  }

  async listBannersPublic() {
    const now = new Date();
    const banners = await this.prisma.cargoBanner.findMany({
      where: {
        isEnabled: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, subtitle: true, imageUrl: true, linkUrl: true },
    });
    return banners;
  }

  async quote(dto: CreateQuoteDto) {
    const itemType = await this.getItemTypeOrThrow(dto.itemTypeId);
    const priced = await this.priceShipment(itemType, {
      declaredWeightKg: dto.declaredWeightKg,
      quantity: dto.quantity,
    });
    return {
      itemTypeId: itemType.id,
      pricingUnit: itemType.pricingUnit,
      declaredWeightKg: priced.declaredWeightKg,
      quantity: priced.quantity,
      pricePerKgTmt: priced.bracket ? this.rubToTmt(Number(priced.bracket.pricePerKgRub), priced.fx) : null,
      pricePerItemTmt: priced.pricePerItemRub === null ? null : this.rubToTmt(priced.pricePerItemRub, priced.fx),
      pickupFeeTmt: this.rubToTmt(priced.pickupFeeRub, priced.fx),
      totalPriceTmt: priced.totalPriceTmt,
    };
  }

  async createShipment(userId: string, dto: CreateShipmentDto) {
    if (dto.deliveryMode === "DOOR_DELIVERY" && !dto.deliveryAddress?.trim()) {
      throw new BadRequestException("deliveryAddress is required for door delivery");
    }

    const [originCity, destinationCity, itemType, paymentMethod] = await Promise.all([
      this.getCityOrThrow(dto.originCityId, "ORIGIN"),
      this.getCityOrThrow(dto.destinationCityId, "DESTINATION"),
      this.getItemTypeOrThrow(dto.itemTypeId),
      this.prisma.paymentMethod.findUnique({ where: { id: dto.paymentMethodId } }),
    ]);
    if (!paymentMethod || !paymentMethod.isEnabled) {
      throw new BadRequestException("Payment method not available");
    }

    const priced = await this.priceShipment(itemType, {
      declaredWeightKg: dto.declaredWeightKg,
      quantity: dto.quantity,
    });
    const publicTrackingNumber = await this.nextTrackingNumber();

    const shipment = await this.prisma.shipment.create({
      data: {
        publicTrackingNumber,
        userId,
        originCityId: originCity.id,
        destinationCityId: destinationCity.id,
        itemTypeId: itemType.id,
        tariffId: priced.bracket?.id ?? null,
        paymentMethodId: paymentMethod.id,
        senderName: dto.senderName,
        senderPhone: dto.senderPhone,
        pickupAddress: dto.pickupAddress,
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        deliveryAddress: dto.deliveryMode === "DOOR_DELIVERY" ? dto.deliveryAddress : null,
        deliveryMode: dto.deliveryMode,
        declaredWeightKg: priced.declaredWeightKg,
        quantity: priced.quantity,
        fragile: dto.fragile ?? false,
        notes: dto.notes,
        pricePerKgRubSnapshot: priced.bracket ? priced.bracket.pricePerKgRub : null,
        pricePerItemRubSnapshot: priced.pricePerItemRub,
        pickupFeeRubSnapshot: priced.pickupFeeRub,
        totalPriceRub: priced.totalPriceRub,
        rubPerUsdSnapshot: priced.fx.rubPerUsd,
        tmtPerUsdSnapshot: priced.fx.tmtPerUsd,
        totalPriceTmt: priced.totalPriceTmt,
        status: "PENDING_PAYMENT",
      },
      include: SHIPMENT_INCLUDE,
    });

    return this.toDto(shipment);
  }

  async findMine(userId: string) {
    const shipments = await this.prisma.shipment.findMany({
      where: { userId },
      include: SHIPMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return shipments.map((s) => this.toDto(s));
  }

  /** Ownership-checked. A caller who isn't staff and doesn't own the shipment gets the same 404
   *  as a genuinely missing id -- not a 403, which would confirm the id exists (IDOR-adjacent). */
  async findOne(id: string, caller: { userId: string; role: string }) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, include: SHIPMENT_INCLUDE });
    if (!shipment) throw new NotFoundException("Shipment not found");
    const isStaff = caller.role === "ADMIN" || caller.role === "MANAGER";
    if (!isStaff && shipment.userId !== caller.userId) throw new NotFoundException("Shipment not found");
    return this.toDto(shipment);
  }

  /** Public, unauthenticated -- deliberately returns only the timeline, never sender/recipient
   *  PII, addresses, phone numbers, or price (see docs/CARGO/ARCHITECTURE.md's privacy note). */
  async track(trackingNumber: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { publicTrackingNumber: trackingNumber },
      select: {
        publicTrackingNumber: true,
        status: true,
        originCity: { select: { name: true, country: true } },
        destinationCity: { select: { name: true, country: true } },
        itemType: { select: { name: true } },
        createdAt: true,
        trackingEvents: {
          orderBy: { createdAt: "asc" },
          select: { status: true, note: true, createdAt: true },
        },
      },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return shipment;
  }

  async requestPickup(shipmentId: string, userId: string, dto: CreatePickupRequestDto) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.userId !== userId) throw new NotFoundException("Shipment not found");
    if (shipment.status !== "PAID") {
      throw new BadRequestException(`Cannot request pickup for a shipment in status ${shipment.status}`);
    }

    await this.prisma.$transaction([
      this.prisma.cargoPickupRequest.create({
        data: {
          shipmentId,
          address: dto.address,
          requestedDate: new Date(dto.requestedDate),
          timeWindow: dto.timeWindow,
          phone: dto.phone,
          notes: dto.notes,
        },
      }),
      this.prisma.shipment.update({ where: { id: shipmentId }, data: { status: "PICKUP_REQUESTED" } }),
      this.prisma.shipmentTrackingEvent.create({
        data: { shipmentId, status: "PICKUP_REQUESTED", createdById: userId },
      }),
    ]);

    return this.findOne(shipmentId, { userId, role: "CUSTOMER" });
  }

  // ---------------------------------------------------------------------------
  // Admin: routes, tariffs & exchange rate
  // ---------------------------------------------------------------------------

  async listCitiesAdmin() {
    return this.prisma.cargoCity.findMany({ orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  }

  async createCity(dto: CreateCityDto, adminId: string) {
    const city = await this.prisma.cargoCity.create({ data: dto });
    this.auditLog.record(adminId, "cargo.city.create", "CargoCity", city.id, dto);
    return city;
  }

  async updateCity(id: string, dto: UpdateCityDto, adminId: string) {
    const existing = await this.prisma.cargoCity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("City not found");
    const city = await this.prisma.cargoCity.update({ where: { id }, data: dto });
    this.auditLog.record(adminId, "cargo.city.update", "CargoCity", id, dto);
    return city;
  }

  async listItemTypesAdmin() {
    return this.prisma.cargoItemType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }

  /** Upsert by `code`, so re-running an environment setup edits the row instead of colliding on
   *  the unique index. Rejects the combinations that would silently price a shipment wrong. */
  async upsertItemType(dto: UpsertItemTypeDto, adminId: string) {
    if (dto.pricingUnit === "PER_ITEM" && (dto.pricePerItemRub === undefined || dto.pricePerItemRub === null)) {
      throw new BadRequestException("pricePerItemRub is required for a per-item cargo type");
    }
    if (dto.pricingUnit === "PER_KG" && (dto.pricePerItemRub ?? null) !== null) {
      throw new BadRequestException("pricePerItemRub does not apply to a per-kg cargo type");
    }
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      pricingUnit: dto.pricingUnit,
      pricePerItemRub: dto.pricingUnit === "PER_ITEM" ? dto.pricePerItemRub : null,
      minWeightKg: dto.pricingUnit === "PER_KG" ? (dto.minWeightKg ?? null) : null,
      isEnabled: dto.isEnabled ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const itemType = await this.prisma.cargoItemType.upsert({
      where: { code: dto.code },
      create: { code: dto.code, ...data },
      update: data,
    });
    this.auditLog.record(adminId, "cargo.item_type.upsert", "CargoItemType", itemType.id, dto);
    return itemType;
  }

  async listBannersAdmin() {
    return this.prisma.cargoBanner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  }

  async upsertBanner(dto: UpsertBannerDto, adminId: string) {
    const data = {
      title: dto.title,
      subtitle: dto.subtitle ?? null,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl ?? null,
      isEnabled: dto.isEnabled ?? true,
      sortOrder: dto.sortOrder ?? 0,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    };
    if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
    const banner = dto.id
      ? await this.prisma.cargoBanner.update({ where: { id: dto.id }, data })
      : await this.prisma.cargoBanner.create({ data });
    this.auditLog.record(adminId, dto.id ? "cargo.banner.update" : "cargo.banner.create", "CargoBanner", banner.id, dto);
    return banner;
  }

  async deleteBanner(id: string, adminId: string) {
    const existing = await this.prisma.cargoBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Banner not found");
    await this.prisma.cargoBanner.delete({ where: { id } });
    this.auditLog.record(adminId, "cargo.banner.delete", "CargoBanner", id, {});
    return { deleted: true };
  }

  /** Replaces the whole bracket set atomically -- deactivating every previous bracket and creating
   *  the submitted ones as the new active set, never leaving a half-updated tariff table a shipment
   *  could be priced against. Existing shipments are untouched: they already snapshotted the
   *  bracket they used at booking time. Global since 2026-09-07 (was per route). */
  async setTariffBrackets(dto: SetTariffBracketsDto, adminId: string) {
    if (dto.brackets.length === 0) throw new BadRequestException("At least one bracket is required");

    const minWeights = dto.brackets.map((b) => b.minWeightKg);
    if (new Set(minWeights).size !== minWeights.length) {
      throw new BadRequestException("Bracket minWeightKg values must be unique");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.cargoTariff.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const rows = [];
      for (const bracket of dto.brackets) {
        rows.push(
          await tx.cargoTariff.create({
            data: {
              minWeightKg: bracket.minWeightKg,
              pricePerKgRub: bracket.pricePerKgRub,
              pickupFeeRub: bracket.pickupFeeRub,
              createdById: adminId,
            },
          }),
        );
      }
      return rows;
    });

    this.auditLog.record(adminId, "cargo.tariff.set_brackets", "CargoTariff", created[0].id, { brackets: dto.brackets });
    return created;
  }

  async getExchangeRateAdmin() {
    const fx = await this.prisma.cargoExchangeRate.findUnique({ where: { id: EXCHANGE_RATE_ID } });
    if (!fx) return null;
    return { rubPerUsd: Number(fx.rubPerUsd), tmtPerUsd: Number(fx.tmtPerUsd), updatedAt: fx.updatedAt };
  }

  async updateExchangeRate(dto: UpdateExchangeRateDto, adminId: string) {
    const fx = await this.prisma.cargoExchangeRate.upsert({
      where: { id: EXCHANGE_RATE_ID },
      create: { id: EXCHANGE_RATE_ID, rubPerUsd: dto.rubPerUsd, tmtPerUsd: dto.tmtPerUsd, updatedById: adminId },
      update: { rubPerUsd: dto.rubPerUsd, tmtPerUsd: dto.tmtPerUsd, updatedById: adminId },
    });
    this.auditLog.record(adminId, "cargo.exchange_rate.update", "CargoExchangeRate", fx.id, dto);
    return { rubPerUsd: Number(fx.rubPerUsd), tmtPerUsd: Number(fx.tmtPerUsd), updatedAt: fx.updatedAt };
  }

  // ---------------------------------------------------------------------------
  // Admin: shipments
  // ---------------------------------------------------------------------------

  async listShipmentsAdmin(filters: { status?: ShipmentStatus; search?: string; take?: number; skip?: number }) {
    const where = {
      status: filters.status,
      ...(filters.search
        ? {
            OR: [
              { publicTrackingNumber: { contains: filters.search, mode: "insensitive" as const } },
              { senderName: { contains: filters.search, mode: "insensitive" as const } },
              { recipientName: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        include: ADMIN_LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: filters.take ?? 50,
        skip: filters.skip ?? 0,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return { items: items.map((s) => this.toDto(s)), total };
  }

  async findOneAdmin(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: { ...SHIPMENT_INCLUDE, user: { select: SAFE_USER_SELECT } },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return this.toDto(shipment);
  }

  async updateStatus(id: string, dto: UpdateShipmentStatusDto, adminId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: { pickup: true, user: { select: { email: true, locale: true } } },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");

    if (!canTransition(SHIPMENT_STATUS_TRANSITIONS, shipment.status, dto.status)) {
      throw new BadRequestException(`Cannot move shipment from ${shipment.status} to ${dto.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id },
        data: {
          status: dto.status,
          paidAt: dto.status === "PAID" ? new Date() : shipment.paidAt,
          cancelledAt: dto.status === "CANCELLED" ? new Date() : shipment.cancelledAt,
        },
      });
      await tx.shipmentTrackingEvent.create({
        data: { shipmentId: id, status: dto.status, note: dto.note, createdById: adminId },
      });
      // The pickup request's own status is a display mirror of the shipment's -- Shipment.status
      // is the single source of truth so the two can never drift apart (see ARCHITECTURE.md §5).
      if (shipment.pickup) {
        if (dto.status === "PICKUP_CONFIRMED") {
          await tx.cargoPickupRequest.update({ where: { id: shipment.pickup.id }, data: { status: "CONFIRMED" } });
        } else if (dto.status === "PICKED_UP") {
          await tx.cargoPickupRequest.update({ where: { id: shipment.pickup.id }, data: { status: "PICKED_UP" } });
        } else if (dto.status === "CANCELLED" && shipment.pickup.status !== "PICKED_UP") {
          await tx.cargoPickupRequest.update({ where: { id: shipment.pickup.id }, data: { status: "CANCELLED" } });
        }
      }
    });

    this.auditLog.record(adminId, "cargo.shipment.status", "Shipment", id, {
      from: shipment.status,
      to: dto.status,
      note: dto.note,
    });

    if (dto.status === "PAID") await this.sendShipmentEmail(shipment, "CARGO_SHIPMENT_CREATED");
    if (dto.status === "DELIVERED") await this.sendShipmentEmail(shipment, "CARGO_SHIPMENT_DELIVERED");

    return this.findOneAdmin(id);
  }

  async addNote(id: string, note: string, adminId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw new NotFoundException("Shipment not found");

    await this.prisma.shipmentTrackingEvent.create({
      data: { shipmentId: id, status: shipment.status, note, createdById: adminId },
    });
    this.auditLog.record(adminId, "cargo.tracking.note", "Shipment", id, { note });
    return this.findOneAdmin(id);
  }

  private async sendShipmentEmail(
    shipment: Shipment & { user: { email: string | null; locale: string } },
    kind: "CARGO_SHIPMENT_CREATED" | "CARGO_SHIPMENT_DELIVERED",
  ) {
    const [originCity, destinationCity] = await Promise.all([
      this.prisma.cargoCity.findUnique({ where: { id: shipment.originCityId } }),
      this.prisma.cargoCity.findUnique({ where: { id: shipment.destinationCityId } }),
    ]);
    await this.email.sendTemplate(kind, {
      toEmail: shipment.user.email,
      userId: shipment.userId,
      locale: shipment.user.locale,
      variables: {
        shipment: {
          trackingNumber: shipment.publicTrackingNumber,
          originCity: originCity?.name ?? "",
          destinationCity: destinationCity?.name ?? "",
          recipientName: shipment.recipientName,
          totalPriceTmt: Number(shipment.totalPriceTmt),
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Shaping
  // ---------------------------------------------------------------------------

  // Generic rather than `Record<string, unknown>`: spreading a plain index-signature type drops
  // its properties from the result's inferred type (a real TS limitation, caught by `nest build`
  // failing on `result.id` in the tests -- plain `tsc --noEmit` didn't catch it, since it ran
  // before the tests existed). A type parameter preserves every field of whatever include-shape
  // Prisma actually returned, e.g. `id` and `route`, alongside the Decimal-to-number overrides.
  private toDto<
    T extends {
      declaredWeightKg: unknown;
      pricePerKgRubSnapshot: unknown;
      pricePerItemRubSnapshot: unknown;
      pickupFeeRubSnapshot: unknown;
      totalPriceRub: unknown;
      rubPerUsdSnapshot: unknown;
      tmtPerUsdSnapshot: unknown;
      totalPriceTmt: unknown;
    },
  >(shipment: T) {
    // Nullable now that a shipment is priced either by weight or by count, never both: keep null
    // as null rather than letting Number(null) quietly report a real 0 kg / 0 RUB.
    const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    return {
      ...shipment,
      declaredWeightKg: num(shipment.declaredWeightKg),
      pricePerKgRubSnapshot: num(shipment.pricePerKgRubSnapshot),
      pricePerItemRubSnapshot: num(shipment.pricePerItemRubSnapshot),
      pickupFeeRubSnapshot: Number(shipment.pickupFeeRubSnapshot),
      totalPriceRub: Number(shipment.totalPriceRub),
      rubPerUsdSnapshot: Number(shipment.rubPerUsdSnapshot),
      tmtPerUsdSnapshot: Number(shipment.tmtPerUsdSnapshot),
      totalPriceTmt: Number(shipment.totalPriceTmt),
    };
  }
}
