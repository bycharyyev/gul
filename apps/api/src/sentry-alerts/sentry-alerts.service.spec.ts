import { SentryAlertsService } from "./sentry-alerts.service";

function issue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    shortId: "GUL-2",
    title: "PrismaClientKnownRequestError",
    culprit: "GET /api/orders",
    level: "error",
    count: "1",
    permalink: "https://gulyaly.sentry.io/issues/147204597/",
    firstSeen: "2026-09-15T14:00:30.000Z",
    ...overrides,
  };
}

describe("SentryAlertsService", () => {
  const previous = { ...process.env };
  const fetchMock = jest.fn();
  const notifyAdmin = jest.fn();

  beforeEach(() => {
    process.env.SENTRY_ALERT_TOKEN = "token";
    fetchMock.mockReset();
    notifyAdmin.mockReset();
    global.fetch = fetchMock;
    // Service construction time (the watermark's initial value) is the fake clock at the moment
    // `target()` runs below -- each test advances it from there to model real ticks 15 minutes apart.
    jest.useFakeTimers().setSystemTime(new Date("2026-09-15T14:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = previous;
  });

  function target() {
    return new SentryAlertsService({ notifyAdmin } as never);
  }

  it("does nothing when no alert token is configured", async () => {
    delete process.env.SENTRY_ALERT_TOKEN;
    await target().checkForNewIssues();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an issue first seen after the service started", async () => {
    const service = target(); // watermark = 14:00:00
    jest.setSystemTime(new Date("2026-09-15T14:01:00.000Z")); // polling a minute later
    fetchMock.mockResolvedValue({ ok: true, json: async () => [issue()] }); // firstSeen 14:00:30

    await service.checkForNewIssues();

    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin.mock.calls[0][0]).toContain("GUL-2");
  });

  it("does not re-report the same issue on the next tick 15 minutes later", async () => {
    // The bug this guards against: age:-20m against a 15-minute cron re-matched a still-fresh
    // issue on the tick right after the one that first reported it, so the same occurrence went
    // out to Telegram twice. Sentry doesn't change firstSeen between polls, so the fix (a
    // firstSeen watermark, advanced past this issue by the first tick) must treat the second
    // tick's identical response as nothing new.
    const service = target(); // watermark = 14:00:00
    fetchMock.mockResolvedValue({ ok: true, json: async () => [issue()] }); // firstSeen 14:00:30

    jest.setSystemTime(new Date("2026-09-15T14:01:00.000Z"));
    await service.checkForNewIssues(); // reports it, watermark -> 14:01:00

    jest.setSystemTime(new Date("2026-09-15T14:16:00.000Z")); // next cron tick, 15 min later
    await service.checkForNewIssues(); // same issue, firstSeen is now <= watermark

    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it("still reports a genuinely new issue on a later tick", async () => {
    const service = target();
    jest.setSystemTime(new Date("2026-09-15T14:01:00.000Z"));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [issue()] });
    await service.checkForNewIssues();

    jest.setSystemTime(new Date("2026-09-15T14:16:00.000Z"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [issue(), issue({ id: "2", shortId: "GUL-3", firstSeen: "2026-09-15T14:10:00.000Z" })],
    });
    await service.checkForNewIssues();

    expect(notifyAdmin).toHaveBeenCalledTimes(2);
    expect(notifyAdmin.mock.calls[1][0]).toContain("GUL-3");
  });

  it("leaves the watermark alone after a failed fetch, so the gap is covered next time", async () => {
    const service = target();
    jest.setSystemTime(new Date("2026-09-15T14:01:00.000Z"));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });
    await service.checkForNewIssues();

    jest.setSystemTime(new Date("2026-09-15T14:16:00.000Z"));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [issue()] }); // firstSeen 14:00:30, still after the untouched watermark (14:00:00)
    await service.checkForNewIssues();

    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });
});
