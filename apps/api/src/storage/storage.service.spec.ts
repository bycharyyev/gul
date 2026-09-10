import { StorageService } from "./storage.service";

function makeConfig(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as never;
}

const S3_ENV = {
  S3_ENDPOINT: "https://s3.regru.cloud",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_PUBLIC_BUCKET: "open",
  S3_PRIVATE_BUCKET: "stor",
};

describe("StorageService", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("public base URL", () => {
    it("defaults to the bucket's virtual-hosted URL on the S3 endpoint", async () => {
      const service = new StorageService(makeConfig(S3_ENV));
      // Nothing is uploaded here -- publicKeyFromUrl round-trips the same base the uploader uses.
      expect(service.publicKeyFromUrl("https://open.s3.regru.cloud/avatars/x.jpg")).toBe("avatars/x.jpg");
    });

    it("uses S3_PUBLIC_BASE_URL when set, so reads can go to a CDN", () => {
      const service = new StorageService(
        makeConfig({ ...S3_ENV, S3_PUBLIC_BASE_URL: "https://cdn.gulyaly.pro" }),
      );
      // The write path still targets the bucket; only the URL handed to clients changes.
      expect(service.publicKeyFromUrl("https://cdn.gulyaly.pro/avatars/x.jpg")).toBe("avatars/x.jpg");
      expect(service.publicKeyFromUrl("https://open.s3.regru.cloud/avatars/x.jpg")).toBeNull();
    });

    it("tolerates a trailing slash in the configured base", () => {
      const service = new StorageService(
        makeConfig({ ...S3_ENV, S3_PUBLIC_BASE_URL: "https://cdn.gulyaly.pro/" }),
      );
      expect(service.publicKeyFromUrl("https://cdn.gulyaly.pro/avatars/x.jpg")).toBe("avatars/x.jpg");
    });
  });

  describe("local-disk fallback", () => {
    it("is allowed in development, where there are no S3 credentials", () => {
      process.env.NODE_ENV = "development";
      const service = new StorageService(makeConfig({}));
      expect(service.mode).toBe("local");
      expect(service.enabled).toBe(false);
    });

    it("is refused in production", () => {
      // The failure this prevents is invisible: with two hosts serving active/active, silent
      // disk writes scatter user files across both and only surface as a 404 after a failover.
      process.env.NODE_ENV = "production";
      const service = new StorageService(makeConfig({}));
      expect(service.mode).toBe("unavailable");
      expect(service.enabled).toBe(false);
    });

    it("is irrelevant once S3 is configured", () => {
      process.env.NODE_ENV = "production";
      const service = new StorageService(makeConfig(S3_ENV));
      expect(service.mode).toBe("s3");
      expect(service.enabled).toBe(true);
    });
  });
});
