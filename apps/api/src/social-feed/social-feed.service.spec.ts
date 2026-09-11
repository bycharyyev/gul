import { BadRequestException } from "@nestjs/common";
import { SocialFeedService } from "./social-feed.service";
import { TRUST_EPOCH } from "./auto-moderation";

/** The public base StorageService reports in production, where S3_PUBLIC_BASE_URL is unset. */
const STORAGE = { publicBase: "https://open.s3.regru.cloud" };

function target(prisma: Record<string, unknown>, storage: unknown = STORAGE) {
  return new SocialFeedService(
    prisma as never,
    { record: jest.fn() } as never,
    storage as never,
  );
}

describe("SocialFeedService safety and idempotency", () => {
  it("refuses remote media rather than fetching arbitrary URLs", async () => {
    const prisma = { galleryProduct: { findMany: jest.fn() } };
    await expect(
      target(prisma).create("u1", {
        mediaType: "IMAGE",
        mediaUrl: "https://example.test/image.jpg",
        productIds: [],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts an upload at the address storage actually serves from", async () => {
    // The regression this covers: the check read S3_PUBLIC_BASE_URL directly, which is optional
    // and unset in production, so it saw no base and refused every upload we had just made
    // ourselves. Nothing could be published with a photo or a video on it.
    const prisma = {
      galleryProduct: { findMany: jest.fn().mockResolvedValue([]) },
      socialPost: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
    };

    await expect(
      target(prisma).create("u1", {
        mediaType: "IMAGE",
        mediaUrl: "https://open.s3.regru.cloud/uploads/abc.jpg",
        productIds: [],
      } as never),
    ).resolves.toBeDefined();
  });

  it("refuses an upload when storage has no public address at all", async () => {
    const prisma = { galleryProduct: { findMany: jest.fn() } };
    await expect(
      target(prisma, { publicBase: null }).create("u1", {
        mediaType: "IMAGE",
        mediaUrl: "https://open.s3.regru.cloud/uploads/abc.jpg",
        productIds: [],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("only accepts enabled Gallery products as tags", async () => {
    const prisma = {
      galleryProduct: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(
      target(prisma).create("u1", {
        mediaType: "TEXT",
        body: "Nice item",
        productIds: ["missing"],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("increments a like only when the interaction insert won the idempotency key", async () => {
    const tx = {
      socialInteraction: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      socialPost: { update: jest.fn() },
    };
    const prisma = {
      socialPost: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "p1", status: "PUBLISHED" }),
      },
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    await expect(
      target(prisma).toggle("u1", "p1", "LIKE", true),
    ).resolves.toEqual({ active: true });
    expect(tx.socialPost.update).not.toHaveBeenCalled();
  });

  it("hands back a cursor no newer than the oldest post it just showed", async () => {
    // The page boundary is what makes pagination whole: everything the next page skips past must
    // already have been shown. Personalised ordering moved an older post to the front of the
    // page, and the cursor was then taken from whatever happened to land last -- a chronologically
    // newer post -- so the following page re-served everything in between.
    const at = (minutes: number) => new Date(Date.UTC(2026, 8, 9, 10, minutes));
    const posts = [5, 4, 3, 2, 1].map((n) => ({
      id: `p${n}`,
      authorId: `a${n}`,
      publishedAt: at(n),
      author: { id: `a${n}`, fullName: "A", username: "a", avatarPath: null },
      products: [],
      likeCount: 0,
      saveCount: 0,
      productClickCount: 0,
    }));
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue(posts) },
      socialInteraction: {
        // The viewer has acted on the oldest post's author, which is exactly what used to drag
        // p1 to the top of the page.
        findMany: jest.fn().mockResolvedValue([
          { type: "SAVE", post: { authorId: "a1", products: [] } },
        ]),
      },
    };

    const page = await target(prisma).list({ userId: "u1", role: "CUSTOMER" }, undefined, 2);

    const shown = page.items.map((item) => item.publishedAt!.getTime());
    const cursorPost = posts.find((p) => p.id === page.nextCursor);
    expect(cursorPost).toBeDefined();
    expect(cursorPost!.publishedAt.getTime()).toBeLessThanOrEqual(Math.min(...shown));
  });

  it("still lets affinity reorder the page it was given", async () => {
    // The boundary is fixed by chronology; the arrangement inside it is not. Without this, the
    // fix above would read as "personalisation removed" rather than "personalisation confined".
    const at = (m: number) => new Date(Date.UTC(2026, 8, 9, 10, m));
    const posts = [3, 2, 1].map((n) => ({
      id: `p${n}`,
      authorId: `a${n}`,
      publishedAt: at(n),
      author: { id: `a${n}`, fullName: "A", username: "a", avatarPath: null },
      products: [],
      likeCount: 0,
      saveCount: 0,
      productClickCount: 0,
    }));
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue(posts) },
      socialInteraction: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ type: "SAVE", post: { authorId: "a2", products: [] } }]),
      },
    };

    const page = await target(prisma).list({ userId: "u1", role: "CUSTOMER" }, undefined, 3);

    // p2's author is the one this viewer saves, so p2 leads a page that is otherwise p3, p2, p1.
    expect(page.items.map((i) => i.id)).toEqual(["p2", "p3", "p1"]);
    // The query asks for one more than the page; three came back for a page of three, so there is
    // no next page and the client is not sent for one that would arrive empty.
    expect(page.nextCursor).toBeNull();
  });

  it("serves a whole page when one author wrote all of it", async () => {
    // The per-author cap used to decide membership and the cursor moved past what it skipped, so
    // a feed where one seller writes everything served two posts and then declared itself over --
    // every other post that seller had published was unreachable.
    const at = (m: number) => new Date(Date.UTC(2026, 8, 9, 10, m));
    const posts = [5, 4, 3, 2, 1].map((n) => ({
      id: `p${n}`,
      authorId: "a1",
      publishedAt: at(n),
      author: { id: "a1", fullName: "A", username: "a", avatarPath: null },
      products: [],
      likeCount: 0,
      saveCount: 0,
      productClickCount: 0,
    }));
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue(posts) },
      socialInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const page = await target(prisma).list(undefined, undefined, 4);

    expect(page.items.map((i) => i.id)).toEqual(["p5", "p4", "p3", "p2"]);
    // Five came back for a page of four, so a fifth post exists and the cursor points at it.
    expect(page.nextCursor).toBe("p2");
  });

  it("keeps one author off the top of a page shared with others", async () => {
    // Order, not membership: the third post by the same author goes last, it does not vanish.
    const at = (m: number) => new Date(Date.UTC(2026, 8, 9, 10, m));
    const posts = [
      { id: "p4", authorId: "a1" },
      { id: "p3", authorId: "a1" },
      { id: "p2", authorId: "a1" },
      { id: "p1", authorId: "a2" },
    ].map((x, i) => ({
      ...x,
      publishedAt: at(4 - i),
      author: { id: x.authorId, fullName: "A", username: "a", avatarPath: null },
      products: [],
      likeCount: 0,
      saveCount: 0,
      productClickCount: 0,
    }));
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue(posts) },
      socialInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const page = await target(prisma).list(undefined, undefined, 4);

    expect(page.items.map((i) => i.id)).toEqual(["p4", "p3", "p1", "p2"]);
  });

  it("reads the viewer's history once, not once per ranking pass", async () => {
    const posts = [2, 1].map((n) => ({
      id: `p${n}`,
      authorId: `a${n}`,
      publishedAt: new Date(Date.UTC(2026, 8, 9, 10, n)),
      author: { id: `a${n}`, fullName: "A", username: "a", avatarPath: null },
      products: [],
      likeCount: 0,
      saveCount: 0,
      productClickCount: 0,
    }));
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue(posts) },
      socialInteraction: { findMany },
    };

    await target(prisma).list({ userId: "u1", role: "CUSTOMER" }, undefined, 2);

    // Two calls: the ranking history, and the liked/saved flags for the posts on this page.
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("publishes a trusted author's post without a person, and holds a newcomer's", async () => {
    const create = jest.fn().mockResolvedValue({});
    const base = {
      galleryProduct: { findMany: jest.fn().mockResolvedValue([]) },
      socialPost: { create, count: jest.fn() },
    };

    base.socialPost.count
      .mockResolvedValueOnce(3) // approved posts
      .mockResolvedValueOnce(0); // upheld complaints
    await target(base).create("u1", {
      mediaType: "TEXT",
      body: "Тёплый плед, очень довольна",
      productIds: [],
    } as never);
    expect(create.mock.calls[0][0].data).toMatchObject({
      status: "PUBLISHED",
      publishedAt: expect.any(Date),
    });

    base.socialPost.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    await target(base).create("u2", {
      mediaType: "TEXT",
      body: "Тёплый плед, очень довольна",
      productIds: [],
    } as never);
    expect(create.mock.calls[1][0].data).toMatchObject({
      status: "PENDING",
      moderationNote: "author:new",
      publishedAt: null,
    });
  });

  it("counts only approvals given under the current rule", async () => {
    // Turning this on must not hand automatic publication to every existing author retroactively:
    // their posts were approved when the rule said a person would read the next one too.
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      galleryProduct: { findMany: jest.fn().mockResolvedValue([]) },
      socialPost: { create: jest.fn().mockResolvedValue({}), count },
    };

    await target(prisma).create("u1", {
      mediaType: "TEXT",
      body: "Тёплый плед",
      productIds: [],
    } as never);

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          publishedAt: { gte: TRUST_EPOCH },
        }),
      }),
    );
    // The offence count carries no such cutoff: a fresh start applies to trust, not to a record.
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: "u1", status: { in: ["REJECTED", "HIDDEN"] } },
      }),
    );
  });

  it("takes a post out of the feed once enough separate people report it", async () => {
    const updateMany = jest.fn();
    const prisma = {
      socialPost: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", status: "PUBLISHED" }),
        updateMany,
      },
      socialPostReport: { upsert: jest.fn(), count: jest.fn().mockResolvedValue(3) },
    };

    await target(prisma).report("u1", "p1", "спам");

    // Only a still-published post is hidden: the guard keeps a later report from resurrecting a
    // decision a moderator has already made.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", status: "PUBLISHED" },
        data: expect.objectContaining({ status: "HIDDEN" }),
      }),
    );
  });

  it("leaves a post alone below the threshold", async () => {
    const updateMany = jest.fn();
    const prisma = {
      socialPost: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", status: "PUBLISHED" }),
        updateMany,
      },
      socialPostReport: { upsert: jest.fn(), count: jest.fn().mockResolvedValue(2) },
    };

    await target(prisma).report("u1", "p1", "спам");

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not expose reports in the public feed include", async () => {
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const page = await target(prisma).list();
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(prisma.socialPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.not.objectContaining({ reports: expect.anything() }),
      }),
    );
  });
});

describe("an author's own posts", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "p1",
    authorId: "u1",
    status: "PUBLISHED",
    createdAt: new Date("2026-09-10T10:00:00Z"),
    publishedAt: new Date("2026-09-10T10:00:00Z"),
    author: {
      id: "u1",
      fullName: "A",
      username: "a",
      avatarPath: null,
      sellerProfile: null,
    },
    products: [],
    ...over,
  });

  it("shows what the feed exists to hide: pending and rejected posts, with the reason", async () => {
    // An author who published and saw nothing had no way to tell a slow moderation queue from a
    // refusal. Their own list is the only place either is visible.
    const prisma = {
      socialPost: {
        findMany: jest.fn().mockResolvedValue([
          row({ id: "p2", status: "PENDING" }),
          row({ id: "p3", status: "REJECTED", moderationNote: "no" }),
        ]),
      },
    };
    const page = await target(prisma).listMine("u1");
    expect(page.items.map((i) => i.status)).toEqual(["PENDING", "REJECTED"]);
    expect(page.items[1].moderationNote).toBe("no");
    expect(prisma.socialPost.findMany.mock.calls[0][0].where).toEqual({
      authorId: "u1",
    });
  });

  it("decides the buttons by the same rules the write routes enforce", async () => {
    // updateMine refuses a hidden post; removeMine accepts only pending or rejected. Deriving that
    // on the client is how a button appears that the server then refuses.
    const prisma = {
      socialPost: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            row({ id: "a", status: "PUBLISHED" }),
            row({ id: "b", status: "PENDING" }),
            row({ id: "c", status: "HIDDEN" }),
          ]),
      },
    };
    const page = await target(prisma).listMine("u1");
    expect(page.items.map((i) => [i.canEdit, i.canDelete])).toEqual([
      [true, false],
      [true, true],
      [false, false],
    ]);
  });
});

describe("the shop behind a post", () => {
  const withShop = (shop: unknown) => ({
    id: "p1",
    authorId: "u2",
    publishedAt: new Date("2026-09-10T10:00:00Z"),
    createdAt: new Date("2026-09-10T10:00:00Z"),
    likeCount: 0,
    saveCount: 0,
    viewCount: 0,
    commentCount: 0,
    productClickCount: 0,
    mediaType: "IMAGE",
    author: {
      id: "u2",
      fullName: "A",
      username: "a",
      avatarPath: null,
      sellerProfile: shop,
    },
    products: [],
  });

  it("carries the handle so a post can lead somewhere", async () => {
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue([withShop({ handle: "altyn", shopName: "Altyn Ay", logoUrl: null, isEnabled: true })]) },
      socialInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const page = await target(prisma).list(undefined, undefined, 5);
    expect(page.items[0].author.shop).toEqual({
      handle: "altyn",
      shopName: "Altyn Ay",
      logoUrl: null,
    });
  });

  it("offers no way into a shop that is closed", async () => {
    // The posts stay; the button would lead to a page that refuses to load.
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue([withShop({ handle: "x", shopName: "X", logoUrl: null, isEnabled: false })]) },
      socialInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const page = await target(prisma).list(undefined, undefined, 5);
    expect(page.items[0].author.shop).toBeNull();
  });

  it("tells an author which posts are theirs", async () => {
    const prisma = {
      socialPost: { findMany: jest.fn().mockResolvedValue([withShop(null)]) },
      socialInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mine = await target(prisma).list({ userId: "u2", role: "CUSTOMER" }, undefined, 5);
    const theirs = await target(prisma).list({ userId: "u9", role: "CUSTOMER" }, undefined, 5);
    expect(mine.items[0].isMine).toBe(true);
    expect(theirs.items[0].isMine).toBe(false);
  });
});
