import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CargoService } from "./cargo.service";

function makePrismaMock() {
  const prisma = {
    cargoCity: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    cargoItemType: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    cargoBanner: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    cargoTariff: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    cargoExchangeRate: { findUnique: jest.fn(), upsert: jest.fn() },
    paymentMethod: { findUnique: jest.fn() },
    shipment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    cargoPickupRequest: { create: jest.fn(), update: jest.fn() },
    shipmentTrackingEvent: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };
  // Same double-duty mock as referrals.service.spec.ts: handles both the array form
  // ($transaction([...])) and the callback form ($transaction(async (tx) => ...)) that
  // CargoService uses in different methods, with `prisma` itself standing in as `tx`.
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : arg,
  );
  return prisma;
}

const WEIGHED_TYPE = {
  id: "type-kg",
  code: "PERSONAL_ITEMS",
  pricingUnit: "PER_KG" as const,
  pricePerItemRub: null,
  minWeightKg: null,
  isEnabled: true,
};
const COUNTED_TYPE = {
  id: "type-item",
  code: "PHONE",
  pricingUnit: "PER_ITEM" as const,
  pricePerItemRub: "1000",
  minWeightKg: null,
  isEnabled: true,
};

describe("CargoService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let email: { sendTemplate: jest.Mock };
  let auditLog: { record: jest.Mock };
  let service: CargoService;

  beforeEach(() => {
    prisma = makePrismaMock();
    email = { sendTemplate: jest.fn() };
    auditLog = { record: jest.fn() };
    service = new CargoService(prisma as never, auditLog as never, email as never);
  });

  describe("quote", () => {
    it("prices the whole shipment off the matching weight bracket, converted through USD cross-rates", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "100", pickupFeeRub: "50" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "100", tmtPerUsd: "20" });

      const result = await service.quote({ itemTypeId: "type-kg", declaredWeightKg: 2 });

      // totalRub = 2 * 100 + 50 = 250; through 100 RUB/USD, 20 TMT/USD -> 2.5 USD -> 50 TMT
      expect(result.pricePerKgTmt).toBe(20);
      expect(result.pickupFeeTmt).toBe(10);
      expect(result.totalPriceTmt).toBe(50);
    });

    it("converts through independent USD cross-rates, not a single derived RUB->TMT number", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "140", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "90", tmtPerUsd: "19.4" });

      const result = await service.quote({ itemTypeId: "type-kg", declaredWeightKg: 1 });

      // 140 RUB / 90 RUB-per-USD = 1.55555... USD; * 19.4 TMT-per-USD = 30.1777... -> 30.18
      expect(result.totalPriceTmt).toBe(30.18);
    });

    it("rounds the RUB total to 2 decimal places before conversion", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "33.33", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });

      const result = await service.quote({ itemTypeId: "type-kg", declaredWeightKg: 1.1 });

      // 1.1 * 33.33 = 36.663 -> 36.66 (identity FX, so the RUB rounding is what's under test)
      expect(result.totalPriceTmt).toBe(36.66);
    });

    it("picks the highest bracket whose minWeightKg the declared weight clears, not a progressive blend", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      // Only the >=50kg bracket should be requested -- service asks Prisma for the single
      // best-matching row (orderBy minWeightKg desc, take 1), so assert the query shape itself.
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-2", minWeightKg: "50", pricePerKgRub: "130", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });

      const result = await service.quote({ itemTypeId: "type-kg", declaredWeightKg: 60 });

      expect(prisma.cargoTariff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, minWeightKg: { lte: 60 } },
          orderBy: { minWeightKg: "desc" },
          take: 1,
        }),
      );
      // 60kg entirely at the 130 RUB/kg bracket, not 50kg@140 + 10kg@130
      expect(result.totalPriceTmt).toBe(60 * 130);
    });

    it("rejects a disabled cargo type", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue({ ...WEIGHED_TYPE, isEnabled: false });
      await expect(service.quote({ itemTypeId: "type-kg", declaredWeightKg: 1 })).rejects.toThrow(NotFoundException);
    });

    it("prices a counted cargo type per unit and ignores weight entirely", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(COUNTED_TYPE);
      prisma.cargoTariff.findFirst.mockResolvedValue({ pickupFeeRub: "0" });
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });

      const result = await service.quote({ itemTypeId: "type-item", quantity: 3 });

      expect(result.totalPriceTmt).toBe(3000);
      expect(result.pricePerKgTmt).toBeNull();
      // No bracket lookup at all: a phone's price does not depend on what it weighs.
      expect(prisma.cargoTariff.findMany).not.toHaveBeenCalled();
    });

    it("refuses a counted cargo type without a quantity rather than quoting zero", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(COUNTED_TYPE);
      prisma.cargoTariff.findFirst.mockResolvedValue({ pickupFeeRub: "0" });
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });
      await expect(service.quote({ itemTypeId: "type-item" })).rejects.toThrow(BadRequestException);
    });

    it("enforces the cargo type's minimum weight, which the partner will not go under", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue({ ...WEIGHED_TYPE, minWeightKg: "5" });
      prisma.cargoTariff.findFirst.mockResolvedValue({ pickupFeeRub: "0" });
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });
      await expect(service.quote({ itemTypeId: "type-kg", declaredWeightKg: 4 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects a weight no bracket covers, rather than pricing at zero", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "90", tmtPerUsd: "19.4" });
      await expect(service.quote({ itemTypeId: "type-kg", declaredWeightKg: 1 })).rejects.toThrow(BadRequestException);
    });

    it("rejects when the exchange rate hasn't been configured yet", async () => {
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "140", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue(null);
      await expect(service.quote({ itemTypeId: "type-kg", declaredWeightKg: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  describe("createShipment", () => {
    /** Origin and destination are resolved independently and each is role-checked, so the mock has
     *  to answer per id rather than return one city for both lookups. */
    function mockCities() {
      prisma.cargoCity.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === "city-ru"
          ? { id: "city-ru", role: "ORIGIN", name: "Москва", country: "RU", isEnabled: true }
          : { id: "city-tm", role: "DESTINATION", name: "Ашхабад", country: "TM", isEnabled: true },
      );
    }

    const baseDto = {
      originCityId: "city-ru", destinationCityId: "city-tm", itemTypeId: "type-kg",
      paymentMethodId: "method-1",
      senderName: "Ahmet",
      senderPhone: "+70000000001",
      pickupAddress: "Moscow, some street",
      recipientName: "Merjen",
      recipientPhone: "+99312345678",
      declaredWeightKg: 2,
    };

    it("snapshots the bracket's RUB price and the USD cross-rates onto the shipment rather than trusting the client", async () => {
      mockCities();
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "100", pickupFeeRub: "50" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "100", tmtPerUsd: "20" });
      prisma.paymentMethod.findUnique.mockResolvedValue({ id: "method-1", isEnabled: true });
      prisma.$queryRawUnsafe.mockResolvedValue([{ value: BigInt(7) }]);
      prisma.shipment.create.mockResolvedValue({ id: "shipment-1", declaredWeightKg: "2", totalPriceTmt: "50" });

      await service.createShipment("user-1", { ...baseDto, deliveryMode: "WAREHOUSE_PICKUP" });

      expect(prisma.shipment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tariffId: "tariff-1",
            paymentMethodId: "method-1",
            pricePerKgRubSnapshot: "100",
            // The pickup fee is normalised to a number on the way through priceShipment, so both
            // pricing units charge it the same way; the per-kg rate is still the raw bracket value.
            pickupFeeRubSnapshot: 50,
            pricePerItemRubSnapshot: null,
            quantity: 1,
            totalPriceRub: 250,
            rubPerUsdSnapshot: "100",
            tmtPerUsdSnapshot: "20",
            totalPriceTmt: 50,
            status: "PENDING_PAYMENT",
          }),
        }),
      );
    });

    it("requires a delivery address for door delivery", async () => {
      await expect(
        service.createShipment("user-1", { ...baseDto, deliveryMode: "DOOR_DELIVERY" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.cargoCity.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a disabled or unknown payment method rather than trusting the client's id", async () => {
      mockCities();
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "100", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });
      prisma.paymentMethod.findUnique.mockResolvedValue({ id: "method-1", isEnabled: false });

      await expect(
        service.createShipment("user-1", { ...baseDto, deliveryMode: "WAREHOUSE_PICKUP" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shipment.create).not.toHaveBeenCalled();
    });

    it("issues a CRG-<year>-###### tracking number from the shared sequence", async () => {
      mockCities();
      prisma.cargoItemType.findUnique.mockResolvedValue(WEIGHED_TYPE);
      prisma.cargoTariff.findMany.mockResolvedValue([
        { id: "tariff-1", minWeightKg: "0", pricePerKgRub: "50", pickupFeeRub: "0" },
      ]);
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "1", tmtPerUsd: "1" });
      prisma.paymentMethod.findUnique.mockResolvedValue({ id: "method-1", isEnabled: true });
      prisma.$queryRawUnsafe.mockResolvedValue([{ value: BigInt(42) }]);
      prisma.shipment.create.mockResolvedValue({ id: "shipment-1" });

      await service.createShipment("user-1", { ...baseDto, deliveryMode: "WAREHOUSE_PICKUP" });

      const call = prisma.shipment.create.mock.calls[0][0];
      expect(call.data.publicTrackingNumber).toMatch(/^CRG-\d{4}-000042$/);
    });
  });

  describe("findOne (ownership)", () => {
    it("returns the shipment to its owner", async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: "s1", userId: "user-1", declaredWeightKg: "2" });
      const result = await service.findOne("s1", { userId: "user-1", role: "CUSTOMER" });
      expect(result.id).toBe("s1");
    });

    it("hides another customer's shipment behind a 404, not a 403", async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: "s1", userId: "someone-else", declaredWeightKg: "2" });
      await expect(service.findOne("s1", { userId: "user-1", role: "CUSTOMER" })).rejects.toThrow(NotFoundException);
    });

    it("lets staff read any shipment regardless of ownership", async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: "s1", userId: "someone-else", declaredWeightKg: "2" });
      const result = await service.findOne("s1", { userId: "admin-1", role: "ADMIN" });
      expect(result.id).toBe("s1");
    });

    it("404s on a genuinely missing id the same way as someone else's shipment", async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      await expect(service.findOne("nope", { userId: "user-1", role: "CUSTOMER" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("requestPickup", () => {
    const dto = { address: "Moscow", requestedDate: "2026-09-10", timeWindow: "10:00-14:00", phone: "+70000000001" };

    it("refuses to request pickup before the shipment is paid", async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: "s1", userId: "user-1", status: "PENDING_PAYMENT" });
      await expect(service.requestPickup("s1", "user-1", dto)).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("hides another customer's shipment behind a 404 rather than letting them request pickup", async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: "s1", userId: "someone-else", status: "PAID" });
      await expect(service.requestPickup("s1", "user-1", dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateStatus (admin transitions)", () => {
    function withShipment(status: string) {
      prisma.shipment.findUnique.mockResolvedValue({
        id: "s1",
        status,
        originCityId: "city-ru", destinationCityId: "city-tm", itemTypeId: "type-kg",
        publicTrackingNumber: "CRG-2026-000001",
        userId: "user-1",
        pickup: null,
        user: { email: "a@b.com", locale: "ru" },
      });
    }

    it("allows a whitelisted transition", async () => {
      prisma.cargoCity.findUnique.mockResolvedValue({ name: "Москва", country: "RU" });
      prisma.shipment.findUnique.mockResolvedValueOnce({
        id: "s1",
        status: "PENDING_PAYMENT",
        originCityId: "city-ru", destinationCityId: "city-tm", itemTypeId: "type-kg",
        publicTrackingNumber: "CRG-2026-000001",
        userId: "user-1",
        pickup: null,
        user: { email: "a@b.com", locale: "ru" },
      });
      // second call is findOneAdmin's own findUnique -- keep it simple, just don't reject
      prisma.shipment.findUnique.mockResolvedValueOnce({
        id: "s1",
        status: "PAID",
        userId: "user-1",
      });

      await service.updateStatus("s1", { status: "PAID" }, "admin-1");

      expect(prisma.shipmentTrackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        "admin-1",
        "cargo.shipment.status",
        "Shipment",
        "s1",
        expect.objectContaining({ from: "PENDING_PAYMENT", to: "PAID" }),
      );
    });

    it("rejects an out-of-order transition, e.g. DELIVERED straight from PENDING_PAYMENT", async () => {
      withShipment("PENDING_PAYMENT");
      await expect(service.updateStatus("s1", { status: "DELIVERED" }, "admin-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("never allows moving out of a terminal DELIVERED status", async () => {
      withShipment("DELIVERED");
      await expect(service.updateStatus("s1", { status: "IN_TRANSIT" }, "admin-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("sends the CARGO_SHIPMENT_CREATED email only on the PAID transition", async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          id: "s1",
          status: "PENDING_PAYMENT",
          originCityId: "city-ru", destinationCityId: "city-tm", itemTypeId: "type-kg",
          publicTrackingNumber: "CRG-2026-000001",
          userId: "user-1",
          pickup: null,
          user: { email: "a@b.com", locale: "ru" },
        })
        .mockResolvedValueOnce({ id: "s1", status: "PAID", userId: "user-1" });
      prisma.cargoCity.findUnique.mockResolvedValue({ name: "Москва", country: "RU" });

      await service.updateStatus("s1", { status: "PAID" }, "admin-1");

      expect(email.sendTemplate).toHaveBeenCalledWith(
        "CARGO_SHIPMENT_CREATED",
        expect.objectContaining({ toEmail: "a@b.com" }),
      );
    });

    it("does not email on an intermediate transition like PICKED_UP -> IN_TRANSIT", async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          id: "s1",
          status: "PICKED_UP",
          originCityId: "city-ru", destinationCityId: "city-tm", itemTypeId: "type-kg",
          publicTrackingNumber: "CRG-2026-000001",
          userId: "user-1",
          pickup: null,
          user: { email: "a@b.com", locale: "ru" },
        })
        .mockResolvedValueOnce({ id: "s1", status: "IN_TRANSIT", userId: "user-1" });

      await service.updateStatus("s1", { status: "IN_TRANSIT" }, "admin-1");

      expect(email.sendTemplate).not.toHaveBeenCalled();
    });
  });

  describe("setTariffBrackets", () => {
    const brackets = [
      { minWeightKg: 0, pricePerKgRub: 140, pickupFeeRub: 0 },
      { minWeightKg: 50, pricePerKgRub: 130, pickupFeeRub: 0 },
      { minWeightKg: 100, pricePerKgRub: 120, pickupFeeRub: 0 },
    ];

    it("deactivates every previous bracket and creates the full new set in one transaction", async () => {
      prisma.cargoTariff.create.mockResolvedValue({ id: "tariff-x" });

      await service.setTariffBrackets({ brackets }, "admin-1");

      expect(prisma.cargoTariff.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prisma.cargoTariff.create).toHaveBeenCalledTimes(3);
      expect(prisma.cargoTariff.create).toHaveBeenNthCalledWith(2, {
        data: { minWeightKg: 50, pricePerKgRub: 130, pickupFeeRub: 0, createdById: "admin-1" },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        "admin-1",
        "cargo.tariff.set_brackets",
        "CargoTariff",
        "tariff-x",
        expect.objectContaining({ brackets }),
      );
    });

    it("rejects an empty bracket list rather than leaving no active tariff at all", async () => {
      await expect(service.setTariffBrackets({ brackets: [] }, "admin-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cargoTariff.updateMany).not.toHaveBeenCalled();
    });

    it("rejects duplicate minWeightKg values across brackets", async () => {
      const dupBrackets = [
        { minWeightKg: 0, pricePerKgRub: 140, pickupFeeRub: 0 },
        { minWeightKg: 0, pricePerKgRub: 130, pickupFeeRub: 0 },
      ];
      await expect(service.setTariffBrackets({ brackets: dupBrackets }, "admin-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cargoTariff.updateMany).not.toHaveBeenCalled();
    });

  });

  describe("exchange rate (admin)", () => {
    it("returns null when no rate has been configured yet, rather than a fabricated default", async () => {
      prisma.cargoExchangeRate.findUnique.mockResolvedValue(null);
      const result = await service.getExchangeRateAdmin();
      expect(result).toBeNull();
    });

    it("returns the configured cross-rates as numbers, not Decimal strings", async () => {
      const updatedAt = new Date("2026-09-04T00:00:00Z");
      prisma.cargoExchangeRate.findUnique.mockResolvedValue({ rubPerUsd: "90", tmtPerUsd: "19.4", updatedAt });
      const result = await service.getExchangeRateAdmin();
      expect(result).toEqual({ rubPerUsd: 90, tmtPerUsd: 19.4, updatedAt });
    });

    it("upserts the singleton row and audit-logs the change", async () => {
      const updatedAt = new Date("2026-09-04T00:00:00Z");
      prisma.cargoExchangeRate.upsert.mockResolvedValue({
        id: "singleton",
        rubPerUsd: "90",
        tmtPerUsd: "19.4",
        updatedAt,
      });

      const result = await service.updateExchangeRate({ rubPerUsd: 90, tmtPerUsd: 19.4 }, "admin-1");

      expect(prisma.cargoExchangeRate.upsert).toHaveBeenCalledWith({
        where: { id: "singleton" },
        create: { id: "singleton", rubPerUsd: 90, tmtPerUsd: 19.4, updatedById: "admin-1" },
        update: { rubPerUsd: 90, tmtPerUsd: 19.4, updatedById: "admin-1" },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        "admin-1",
        "cargo.exchange_rate.update",
        "CargoExchangeRate",
        "singleton",
        { rubPerUsd: 90, tmtPerUsd: 19.4 },
      );
      expect(result).toEqual({ rubPerUsd: 90, tmtPerUsd: 19.4, updatedAt });
    });
  });
});
