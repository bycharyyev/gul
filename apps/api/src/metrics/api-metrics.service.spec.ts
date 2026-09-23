import {
  byApiKeyFrom,
  byDayFrom,
  byTierFrom,
  dayKey,
  endpointsFrom,
  lastDays,
  statusClass,
  totalsFrom,
} from "./api-metrics.service";
import { routeTemplate, statusOf, tierOf } from "./api-metrics.interceptor";

describe("statusClass", () => {
  it("buckets by class, not by exact status", () => {
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass(204)).toBe("2xx");
    expect(statusClass(301)).toBe("2xx"); // a redirect is not a failure
    expect(statusClass(400)).toBe("4xx");
    expect(statusClass(429)).toBe("4xx");
    expect(statusClass(500)).toBe("5xx");
    expect(statusClass(503)).toBe("5xx");
  });
});

describe("day keys", () => {
  it("uses UTC so a boundary means the same everywhere", () => {
    // 00:30 Ashgabat on the 2nd is still the 1st in UTC. Without this the same request would be
    // filed under different days depending on where it was read.
    expect(dayKey(new Date("2026-09-01T21:30:00.000Z"))).toBe("2026-09-01");
  });

  it("returns the window oldest-first, including today", () => {
    expect(lastDays(3, new Date("2026-09-03T10:00:00.000Z"))).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(lastDays(2, new Date("2026-09-01T10:00:00.000Z"))).toEqual(["2026-08-31", "2026-09-01"]);
  });
});

describe("aggregation", () => {
  const day1 = {
    "customer|GET /orders/me|2xx": "10",
    "customer|GET /orders/me|5xx": "1",
    "public|GET /catalog/services|2xx": "40",
    "partner|POST /partner/orders|4xx": "3",
  };
  const day2 = {
    "customer|GET /orders/me|2xx": "5",
    "public|GET /catalog/services|2xx": "20",
  };

  it("totals split ok, client error and server error", () => {
    expect(totalsFrom([day1, day2])).toEqual({
      total: 79,
      ok: 75,
      clientError: 3,
      serverError: 1,
    });
  });

  it("keeps a day with no traffic in the series rather than dropping it", () => {
    // A gap in a chart is information -- silently omitting the day makes an outage look like a
    // quiet period.
    expect(byDayFrom(["2026-09-01", "2026-09-02", "2026-09-03"], [day1, {}, day2])).toEqual([
      { day: "2026-09-01", total: 54, clientError: 3, serverError: 1 },
      { day: "2026-09-02", total: 0, clientError: 0, serverError: 0 },
      { day: "2026-09-03", total: 25, clientError: 0, serverError: 0 },
    ]);
  });

  it("groups by trust boundary, busiest first", () => {
    expect(byTierFrom([day1])).toEqual([
      { tier: "public", total: 40, clientError: 0, serverError: 0 },
      { tier: "customer", total: 11, clientError: 0, serverError: 1 },
      { tier: "partner", total: 3, clientError: 3, serverError: 0 },
    ]);
  });

  it("computes an average latency per endpoint across the window", () => {
    const latency = [
      { "GET /orders/me|sum": "1000", "GET /orders/me|n": "10" },
      { "GET /orders/me|sum": "500", "GET /orders/me|n": "5" },
    ];

    const rows = endpointsFrom([day1, day2], latency);
    const orders = rows.find((r) => r.endpoint === "GET /orders/me");

    expect(orders).toEqual({
      endpoint: "GET /orders/me",
      total: 16,
      clientError: 0,
      serverError: 1,
      avgMs: 100,
    });
  });

  it("reports no average rather than zero when an endpoint has no latency samples", () => {
    // Zero would read as "instant", which is the opposite of "unknown".
    const rows = endpointsFrom([day1], []);
    expect(rows.every((r) => r.avgMs === null)).toBe(true);
  });

  it("attributes partner volume per key", () => {
    expect(
      byApiKeyFrom([
        { "key_a|2xx": "100", "key_a|4xx": "5", "key_b|2xx": "7" },
        { "key_a|5xx": "2" },
      ]),
    ).toEqual([
      { apiKeyId: "key_a", total: 107, clientError: 5, serverError: 2 },
      { apiKeyId: "key_b", total: 7, clientError: 0, serverError: 0 },
    ]);
  });

  it("ignores a malformed field instead of throwing", () => {
    // Anything already in Redis from an older key shape must not break the admin screen.
    expect(totalsFrom([{ garbage: "5", "a|b": "3" }])).toEqual({
      total: 0,
      ok: 0,
      clientError: 0,
      serverError: 0,
    });
  });
});

describe("what the interceptor records", () => {
  it("records the route template, never the resolved path", () => {
    // The whole point: /orders/:id is one row, not one row per order id -- and an order-tracking
    // URL carries a recipient phone number in its query.
    expect(routeTemplate({ route: { path: "/orders/:id" }, method: "GET" })).toBe("/orders/:id");
  });

  it("buckets an unmatched path instead of recording it", () => {
    // A scanner probing random URLs would otherwise be unbounded cardinality in Redis.
    expect(routeTemplate({ method: "GET" })).toBe("unmatched");
    expect(routeTemplate({ route: {}, method: "GET" })).toBe("unmatched");
  });

  it("names the trust boundary the caller came through", () => {
    expect(tierOf({})).toBe("public");
    expect(tierOf({ user: { role: "CUSTOMER" } })).toBe("customer");
    expect(tierOf({ user: { role: "ADMIN" } })).toBe("staff");
    expect(tierOf({ user: { role: "SUPPORT" } })).toBe("staff");
    expect(tierOf({ apiKey: { id: "key_a" } })).toBe("partner");
  });

  it("treats an api key as partner even if a user is also attached", () => {
    // Defensive: the two authentication paths are mutually exclusive today, and if that ever
    // changes the key is the more specific attribution.
    expect(tierOf({ apiKey: { id: "key_a" }, user: { role: "CUSTOMER" } })).toBe("partner");
  });

  it("reads a status off a Nest exception, and calls anything else a 500", () => {
    expect(statusOf({ getStatus: () => 404 })).toBe(404);
    expect(statusOf({ status: 429 })).toBe(429);
    expect(statusOf(new Error("boom"))).toBe(500);
    expect(statusOf(undefined)).toBe(500);
  });
});
