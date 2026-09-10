import { HttpOperatorGateway } from "./http-operator.gateway";

describe("HttpOperatorGateway", () => {
  const previous = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env.TOPUP_HTTP_BASE_URL = "https://operator.example/v1/";
    process.env.TOPUP_HTTP_API_KEY = "secret-key";
    process.env.TOPUP_HTTP_TIMEOUT_MS = "5000";
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    process.env = previous;
  });

  it("sends the stable idempotency key and canonical request", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('{"outcome":"CONFIRMED","operatorRef":"ref-1"}'),
    });
    const gateway = new HttpOperatorGateway();
    const order = {
      id: "order-1",
      serviceId: "service-1",
      recipientIdentifier: "+99360000000",
      amountTmt: { toString: () => "10.00" },
    };

    await expect(gateway.topUp(order as never, "order-1")).resolves.toEqual({
      outcome: "CONFIRMED",
      operatorRef: "ref-1",
      errorMessage: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://operator.example/v1/topups"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-key",
          "idempotency-key": "order-1",
        }),
      }),
    );
  });

  it.each(["http://operator.example", "https://user:pass@operator.example", "https://operator.example?q=1"])(
    "rejects unsafe endpoint %s",
    (endpoint) => {
      process.env.TOPUP_HTTP_BASE_URL = endpoint;
      expect(() => new HttpOperatorGateway()).toThrow("clean HTTPS");
    },
  );

  it("treats malformed success responses as ambiguous failures", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: jest.fn().mockResolvedValue('{"success":true}') });
    await expect(
      new HttpOperatorGateway().topUp({ id: "o", serviceId: "s", recipientIdentifier: "r", amountTmt: 1 } as never, "order-1"),
    ).rejects.toThrow("invalid outcome");
  });

  it("does not expose an API response body in HTTP errors", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('{"secret":"must-not-leak"}'),
    });
    await expect(
      new HttpOperatorGateway().topUp({ id: "o", serviceId: "s", recipientIdentifier: "r", amountTmt: 1 } as never, "order-1"),
    ).rejects.toThrow("Operator HTTP 503");
  });

  it("aborts a streamed response as soon as it exceeds 64 KiB", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(65 * 1024), { status: 200 }));
    await expect(
      new HttpOperatorGateway().topUp({ id: "o", serviceId: "s", recipientIdentifier: "r", amountTmt: 1 } as never, "order-1"),
    ).rejects.toThrow("response is too large");
  });

  it("requires a durable provider reference for a confirmed top-up", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('{"outcome":"CONFIRMED"}'),
    });
    await expect(
      new HttpOperatorGateway().topUp({ id: "o", serviceId: "s", recipientIdentifier: "r", amountTmt: 1 } as never, "order-1"),
    ).rejects.toThrow("requires a reference");
  });
});
