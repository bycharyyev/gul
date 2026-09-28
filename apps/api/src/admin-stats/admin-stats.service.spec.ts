import { AdminStatsService } from "./admin-stats.service";

function makeService(row: Record<string, unknown> | undefined, newCurrent: number, newPrevious: number) {
  const queryRaw = jest.fn().mockResolvedValue(row ? [row] : []);
  const count = jest.fn().mockResolvedValueOnce(newCurrent).mockResolvedValueOnce(newPrevious);
  const prisma = { $queryRaw: queryRaw, user: { count } };
  const service = new AdminStatsService(prisma as never, {} as never);
  return { service, queryRaw, count };
}

describe("AdminStatsService.getPeriodComparison", () => {
  it("maps both windows and converts bigint counts", async () => {
    const { service } = makeService(
      { curOrders: 12n, prevOrders: 8n, curCompleted: 10n, prevCompleted: 5n, curVolume: 450.5, prevVolume: 300 },
      4,
      2,
    );
    await expect(service.getPeriodComparison(7)).resolves.toEqual({
      days: 7,
      current: { orders: 12, completedOrders: 10, volumeTmt: 450.5, newCustomers: 4 },
      previous: { orders: 8, completedOrders: 5, volumeTmt: 300, newCustomers: 2 },
    });
  });

  it("measures two windows of equal length that meet exactly", async () => {
    const { service, count } = makeService(undefined, 0, 0);
    await service.getPeriodComparison(30);
    const current = count.mock.calls[0][0].where.createdAt;
    const previous = count.mock.calls[1][0].where.createdAt;
    expect(previous.lt).toEqual(current.gte);
    expect(current.lt.getTime() - current.gte.getTime()).toBe(30 * 86_400_000);
    expect(previous.lt.getTime() - previous.gte.getTime()).toBe(30 * 86_400_000);
  });

  it("treats an empty table as zeros and clamps the period", async () => {
    const { service } = makeService(undefined, 0, 0);
    const result = await service.getPeriodComparison(10_000);
    expect(result.days).toBe(365);
    expect(result.current).toEqual({ orders: 0, completedOrders: 0, volumeTmt: 0, newCustomers: 0 });
  });
});
