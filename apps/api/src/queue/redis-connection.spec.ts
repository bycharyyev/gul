import { parseSentinels, redisOptionsFromEnv } from "./redis-connection";

describe("redisOptionsFromEnv", () => {
  it("uses REDIS_URL directly when no Sentinels are configured", () => {
    const { url, options } = redisOptionsFromEnv({ REDIS_URL: "redis://:pw@redis:6379" });
    expect(url).toBe("redis://:pw@redis:6379");
    expect(options.sentinels).toBeUndefined();
  });

  it("switches to Sentinel discovery and keeps the password from REDIS_URL", () => {
    const { url, options } = redisOptionsFromEnv({
      REDIS_URL: "redis://:p%2Fw%3D@redis:6379",
      REDIS_SENTINELS: "10.0.0.1:26379, 10.0.0.2:26379,10.0.0.3",
    });
    expect(url).toBeUndefined();
    expect(options.name).toBe("gul");
    expect(options.password).toBe("p/w=");
    expect(options.sentinels).toEqual([
      { host: "10.0.0.1", port: 26379 },
      { host: "10.0.0.2", port: 26379 },
      { host: "10.0.0.3", port: 26379 },
    ]);
  });

  it("reconnects on READONLY (a node demoted under an open connection) and nothing else", () => {
    const { options } = redisOptionsFromEnv({ REDIS_SENTINELS: "a:26379" });
    const decide = options.reconnectOnError as (e: Error) => boolean | 1 | 2;
    expect(decide(new Error("READONLY You can't write against a read only replica."))).toBe(2);
    expect(decide(new Error("WRONGTYPE Operation against a key"))).toBe(false);
  });

  it("rejects a malformed Sentinel entry instead of silently dropping it", () => {
    expect(() => parseSentinels("a:notaport")).toThrow(/bad REDIS_SENTINELS/);
  });
});
