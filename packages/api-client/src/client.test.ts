import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, MemoryTokenStore, mergeMessages } from "./client.js";

const BASE = "https://api.test/api";

function json(status: number, body: unknown) {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient request pipeline", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let tokens: MemoryTokenStore;
  let onSessionExpired: ReturnType<typeof vi.fn>;
  let api: ApiClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    tokens = new MemoryTokenStore();
    onSessionExpired = vi.fn();
    api = new ApiClient({ baseUrl: `${BASE}/`, tokenStore: tokens, onSessionExpired });
  });

  afterEach(() => vi.unstubAllGlobals());

  const call = (n: number) => fetchMock.mock.calls[n] as [string, RequestInit];

  it("sends the access token and a JSON content type, and parses the body", async () => {
    tokens.setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(json(200, { id: "me" }));

    await expect(api.getMe()).resolves.toEqual({ id: "me" });

    const [url, init] = call(0);
    expect(url).toBe(`${BASE}/auth/me`);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("never attaches the token to a public endpoint", async () => {
    tokens.setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(json(200, []));

    await api.listServices();

    expect(new Headers(call(0)[1].headers).has("Authorization")).toBe(false);
  });

  it("refreshes once on a 401 and replays the request with the new token", async () => {
    tokens.setTokens("expired", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(json(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(json(200, { accessToken: "access-2", refreshToken: "refresh-2" }))
      .mockResolvedValueOnce(json(200, { id: "me" }));

    await expect(api.getMe()).resolves.toEqual({ id: "me" });

    expect(call(1)[0]).toBe(`${BASE}/auth/refresh`);
    expect(JSON.parse(String(call(1)[1].body))).toEqual({ refreshToken: "refresh-1" });
    expect(new Headers(call(2)[1].headers).get("Authorization")).toBe("Bearer access-2");
    expect(tokens.getRefreshToken()).toBe("refresh-2");
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("shares one refresh between concurrent 401s", async () => {
    tokens.setTokens("expired", "refresh-1");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        await gate;
        return json(200, { accessToken: "access-2", refreshToken: "refresh-2" });
      }
      const auth = new Headers(init.headers).get("Authorization");
      return auth === "Bearer access-2" ? json(200, { ok: true }) : json(401, {});
    });

    const both = Promise.all([api.getMe(), api.getMe()]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await both;

    const refreshes = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("clears tokens and reports the expired session when the refresh is refused", async () => {
    tokens.setTokens("expired", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(json(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(json(401, {}));

    await expect(api.getMe()).rejects.toBeInstanceOf(ApiError);

    expect(tokens.getAccessToken()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does not try to refresh without a refresh token", async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}));

    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("turns an error body into an ApiError carrying status, code and request id", async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { code: "PHONE_ALREADY_REGISTERED", message: "PHONE_ALREADY_REGISTERED", requestId: "req-9" }),
    );

    const err = await api.listServices().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "PHONE_ALREADY_REGISTERED", requestId: "req-9" });
  });

  it("treats an empty success body as no content instead of a JSON parse failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 201 }));

    await expect(api.listServices()).resolves.toBeUndefined();
  });
});


describe("mergeMessages", () => {
  const m = (id: string, at: string) => ({ id, createdAt: at });

  it("a full read replaces what is held", () => {
    expect(mergeMessages([m("a", "2026-10-02T10:00:00Z")], [m("b", "2026-10-02T10:01:00Z")], false)).toEqual([
      m("b", "2026-10-02T10:01:00Z"),
    ]);
  });

  it("an incremental read appends, skipping a message already shown (our own send)", () => {
    const held = [m("a", "2026-10-02T10:00:00Z"), m("mine", "2026-10-02T10:02:00Z")];
    const incoming = [m("theirs", "2026-10-02T10:01:00Z"), m("mine", "2026-10-02T10:02:00Z")];
    expect(mergeMessages(held, incoming, true).map((x) => x.id)).toEqual(["a", "theirs", "mine"]);
  });

  it("an empty incremental read keeps the same array (no re-render)", () => {
    const held = [m("a", "2026-10-02T10:00:00Z")];
    expect(mergeMessages(held, [], true)).toBe(held);
  });
});
