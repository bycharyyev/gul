import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "crypto";
import { ApiKeyGuard } from "./api-key.guard";
import { readFileSync } from "fs";
import { join } from "path";
import { API_KEY_SCOPES, PARTNER_SCOPES, SHOP_SCOPES, isApiKeyScope } from "./api-key-scopes";
import { ShopKeyGuard } from "../seller-api/shop-key.guard";

const RAW = "sk_live_abc";
const HASH = createHash("sha256").update(RAW).digest("hex");

type KeyRow = {
  id: string;
  ownerLabel: string;
  isEnabled: boolean;
  expiresAt: Date | null;
  scopes: string[];
};

class FakePrisma {
  row: KeyRow | null = {
    id: "key_a",
    ownerLabel: "Acme",
    isEnabled: true,
    expiresAt: null,
    scopes: [...API_KEY_SCOPES],
  };
  previousHash: string | null = null;
  previousExpiresAt: Date | null = null;
  /** Simulates the deploy window where the new columns are not in the database yet. */
  legacySchema = false;

  apiKey = {
    findFirst: async ({ where }: { where: { OR: { keyHash?: string; previousKeyHash?: string }[] } }) => {
      if (this.legacySchema) {
        throw { code: "P2022", meta: { column: "ApiKey.scopes" } };
      }
      const wantsCurrent = where.OR.some((c) => c.keyHash === HASH);
      const wantsPrevious = where.OR.some(
        (c) =>
          c.previousKeyHash === this.previousHash &&
          this.previousHash !== null &&
          (this.previousExpiresAt?.getTime() ?? 0) > Date.now(),
      );
      return wantsCurrent || wantsPrevious ? this.row : null;
    },
    findUnique: async () => (this.row ? { ...this.row } : null),
    update: async () => ({}),
  };
}

function contextFor(rawKey: string | undefined, handler: () => void = () => {}): ExecutionContext {
  const request: Record<string, unknown> = { headers: rawKey ? { "x-api-key": rawKey } : {} };
  return {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(prisma: FakePrisma, requiredScope?: string) {
  const reflector = {
    getAllAndOverride: () => requiredScope,
  } as unknown as Reflector;
  return new ApiKeyGuard(prisma as never, reflector);
}

describe("ApiKeyGuard", () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = new FakePrisma();
  });

  it("rejects a request with no key", async () => {
    await expect(guardWith(prisma).canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts a valid key and attaches it to the request", async () => {
    const context = contextFor(RAW);
    await expect(guardWith(prisma).canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest();
    // sellerId travels with the key so the seller surface can read the shop off it. Null here:
    // this fixture is a partner key, which belongs to no shop.
    expect(request.apiKey).toEqual({ id: "key_a", ownerLabel: "Acme", sellerId: null });
  });

  it("rejects a disabled key", async () => {
    prisma.row!.isEnabled = false;
    await expect(guardWith(prisma).canActivate(contextFor(RAW))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe("expiry", () => {
    it("rejects a key past its date", async () => {
      prisma.row!.expiresAt = new Date(Date.now() - 1000);
      await expect(guardWith(prisma).canActivate(contextFor(RAW))).rejects.toThrow("API key expired");
    });

    it("accepts a key that has not reached its date", async () => {
      prisma.row!.expiresAt = new Date(Date.now() + 60_000);
      await expect(guardWith(prisma).canActivate(contextFor(RAW))).resolves.toBe(true);
    });

    it("says 'expired', not 'invalid'", async () => {
      // A partner can act on "your key expired". They cannot act on "invalid or disabled".
      prisma.row!.expiresAt = new Date(Date.now() - 1000);
      await expect(guardWith(prisma).canActivate(contextFor(RAW))).rejects.not.toThrow(
        "Invalid or disabled API key",
      );
    });
  });

  describe("scopes", () => {
    it("allows a route whose scope the key holds", async () => {
      prisma.row!.scopes = ["catalog:read"];
      await expect(
        guardWith(prisma, "catalog:read").canActivate(contextFor(RAW)),
      ).resolves.toBe(true);
    });

    it("refuses a route whose scope the key lacks", async () => {
      // A catalogue-reading key must not be able to place orders.
      prisma.row!.scopes = ["catalog:read"];
      await expect(
        guardWith(prisma, "orders:write").canActivate(contextFor(RAW)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("names the missing scope, so the partner knows what to ask for", async () => {
      prisma.row!.scopes = ["catalog:read"];
      await expect(
        guardWith(prisma, "orders:write").canActivate(contextFor(RAW)),
      ).rejects.toThrow('missing the "orders:write" scope');
    });

    it("treats an empty scope list as reaching nothing", async () => {
      prisma.row!.scopes = [];
      await expect(
        guardWith(prisma, "catalog:read").canActivate(contextFor(RAW)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("rotation grace period", () => {
    it("still accepts the previous secret inside the window", async () => {
      // Without this, rotating a key is an outage: the old one dies the instant the new one is
      // minted, and the partner has not deployed it yet.
      prisma.previousHash = HASH;
      prisma.previousExpiresAt = new Date(Date.now() + 60_000);
      await expect(guardWith(prisma).canActivate(contextFor(RAW))).resolves.toBe(true);
    });

    it("rejects the previous secret once the window closes", async () => {
      prisma.previousHash = HASH;
      prisma.previousExpiresAt = new Date(Date.now() - 1000);
      prisma.apiKey.findFirst = async () => null;
      await expect(guardWith(prisma).canActivate(contextFor(RAW))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it("keeps partners working during the deploy window before the migration runs", async () => {
    // The pipeline starts new code before migrating. Failing closed here would take a working
    // integration down for a schema change it did not ask for.
    prisma.legacySchema = true;
    await expect(guardWith(prisma, "orders:write").canActivate(contextFor(RAW))).resolves.toBe(
      true,
    );
  });

  it("fails closed on an unexpected database error", async () => {
    prisma.apiKey.findFirst = async () => {
      throw new Error("connection lost");
    };
    await expect(guardWith(prisma).canActivate(contextFor(RAW))).rejects.toThrow(
      "API key validation is temporarily unavailable",
    );
  });
});

describe("key-authenticated routes", () => {
  // Both surfaces, one rule. Read as source rather than imported: importing a controller pulls in
  // the ESM types package, which Jest cannot parse -- and a static scan catches the same mistake.
  const controllers = [
    join(__dirname, "partner.controller.ts"),
    join(__dirname, "..", "seller-api", "seller-api.controller.ts"),
  ];

  it.each(controllers)("every route in %s declares a scope", (file) => {
    // Forgetting the decorator on a new route is exactly how a read-only key quietly gains the
    // ability to create orders.
    const source = readFileSync(file, "utf8");
    const lines = source.split(String.fromCharCode(10));

    const routeLines = lines
      .map((line, i) => ({ line: line.trim(), i }))
      .filter(({ line }) => /^@(Get|Post|Patch|Delete|Put)\(/.test(line));

    expect(routeLines.length).toBeGreaterThan(0);

    for (const { i } of routeLines) {
      // A route may carry @HttpCode between the scope and the verb, so walk back over the
      // decorators rather than reading only the line above.
      const preceding = lines
        .slice(Math.max(0, i - 4), i)
        .map((line) => line.trim())
        .reverse();
      const declaration = preceding.find((line) => line.startsWith("@RequiresScope("));
      expect(declaration).toBeDefined();
      const match = declaration!.match(/^@RequiresScope\("([^"]+)"\)$/);
      expect(match).not.toBeNull();
      expect(isApiKeyScope(match![1])).toBe(true);
    }
  });

  it("declares exactly the scopes the guard knows about", () => {
    expect([...API_KEY_SCOPES]).toEqual([
      "catalog:read",
      "orders:read",
      "orders:write",
      "products:read",
      "products:write",
      "shop-orders:read",
      "shop-orders:write",
      "chat:read",
      "chat:write",
    ]);
  });

  it("keeps the shop's own routes off the partner scopes and the reverse", () => {
    // The two lists answer different questions -- a partner's `orders:read` is top-up orders it
    // placed, a shop's is somebody buying a bouquet. One shared name would make every scope
    // decision on both surfaces ambiguous.
    const partnerSource = readFileSync(controllers[0], "utf8");
    const shopSource = readFileSync(controllers[1], "utf8");

    for (const scope of SHOP_SCOPES) {
      expect(partnerSource).not.toContain(`@RequiresScope("${scope}")`);
    }
    for (const scope of PARTNER_SCOPES) {
      expect(shopSource).not.toContain(`@RequiresScope("${scope}")`);
    }
  });
});

describe("ShopKeyGuard", () => {
  const guard = new ShopKeyGuard();
  const requestWith = (apiKey: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ apiKey }) }),
    }) as never;

  it("lets a shop key through", () => {
    expect(guard.canActivate(requestWith({ id: "k1", sellerId: "s1" }))).toBe(true);
  });

  it("refuses a partner key, which belongs to no shop", () => {
    // Without this, a partner key holding products:read would reach a sellerId of null and the
    // queries below would quietly mean "every product with no shop" -- the house stock.
    expect(() => guard.canActivate(requestWith({ id: "k1", sellerId: null }))).toThrow(
      ForbiddenException,
    );
  });

  it("refuses a request that reached it with no key at all", () => {
    expect(() => guard.canActivate(requestWith(undefined))).toThrow(ForbiddenException);
  });
});
