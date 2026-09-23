import { MockOperatorGateway } from "./mock-operator.gateway";
import { selectOperatorGateway } from "./operator-gateway.provider";
import { UnconfiguredOperatorGateway } from "./unconfigured-operator.gateway";
import { HttpOperatorGateway } from "./http-operator.gateway";

describe("operator gateway selection", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGateway = process.env.TOPUP_GATEWAY;
  const previousBaseUrl = process.env.TOPUP_HTTP_BASE_URL;
  const previousApiKey = process.env.TOPUP_HTTP_API_KEY;
  const previousAllowMock = process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION;

  afterEach(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousGateway === undefined) delete process.env.TOPUP_GATEWAY;
    else process.env.TOPUP_GATEWAY = previousGateway;
    if (previousBaseUrl === undefined) delete process.env.TOPUP_HTTP_BASE_URL;
    else process.env.TOPUP_HTTP_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.TOPUP_HTTP_API_KEY;
    else process.env.TOPUP_HTTP_API_KEY = previousApiKey;
    if (previousAllowMock === undefined) delete process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION;
    else process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION = previousAllowMock;
  });

  it("fails closed when no gateway is configured", () => {
    delete process.env.TOPUP_GATEWAY;
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      UnconfiguredOperatorGateway,
    );
  });

  it("uses mock only when it is explicitly selected outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.TOPUP_GATEWAY = "mock";
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      MockOperatorGateway,
    );
  });

  it("does not enable mock in production on TOPUP_GATEWAY alone", () => {
    process.env.NODE_ENV = "production";
    process.env.TOPUP_GATEWAY = "mock";
    delete process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION;
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      UnconfiguredOperatorGateway,
    );
  });

  it("enables mock in production only behind the explicit pre-launch opt-in", () => {
    process.env.NODE_ENV = "production";
    process.env.TOPUP_GATEWAY = "mock";
    process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION = "true";
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      MockOperatorGateway,
    );
  });

  it("treats any value other than exactly \"true\" as no opt-in", () => {
    process.env.NODE_ENV = "production";
    process.env.TOPUP_GATEWAY = "mock";
    process.env.TOPUP_ALLOW_MOCK_IN_PRODUCTION = "yes";
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      UnconfiguredOperatorGateway,
    );
  });

  it("selects the real HTTPS bridge only with complete configuration", () => {
    process.env.TOPUP_GATEWAY = "http";
    process.env.TOPUP_HTTP_BASE_URL = "https://operator.example/v1";
    process.env.TOPUP_HTTP_API_KEY = "secret";
    expect(selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toBeInstanceOf(
      HttpOperatorGateway,
    );
  });

  it("fails startup for a partially configured HTTPS bridge", () => {
    process.env.TOPUP_GATEWAY = "http";
    delete process.env.TOPUP_HTTP_BASE_URL;
    delete process.env.TOPUP_HTTP_API_KEY;
    expect(() => selectOperatorGateway(new MockOperatorGateway(), new UnconfiguredOperatorGateway())).toThrow(
      "TOPUP_HTTP_BASE_URL",
    );
  });
});
