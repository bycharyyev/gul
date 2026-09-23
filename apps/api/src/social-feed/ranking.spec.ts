import {
  buildViewerSignals,
  engagementRate,
  MAX_LEADING_PER_AUTHOR,
  NO_SIGNALS,
  rankPage,
  recencyDecay,
  scorePost,
  WEIGHTS,
  type RankablePost,
} from "./ranking";

const NOW = new Date("2026-09-12T00:00:00Z");

function post(overrides: Partial<RankablePost> & { id: string }): RankablePost {
  return {
    authorId: "a1",
    publishedAt: NOW,
    likeCount: 0,
    saveCount: 0,
    viewCount: 100,
    productClickCount: 0,
    commentCount: 0,
    mediaType: "IMAGE",
    products: [],
    ...overrides,
  };
}

describe("engagementRate", () => {
  it("measures per view, so age alone cannot win", () => {
    // The whole point of a rate. On raw counts the old post wins every time, and the feed becomes
    // a ranking of how long something has been up.
    const fresh = post({ id: "new", saveCount: 3, viewCount: 10 });
    const old = post({ id: "old", saveCount: 5, viewCount: 1000 });
    expect(engagementRate(fresh)).toBeGreaterThan(engagementRate(old));
  });

  it("weighs a save above a like and a product click above both", () => {
    const liked = post({ id: "l", likeCount: 10 });
    const saved = post({ id: "s", saveCount: 10 });
    const clicked = post({ id: "c", productClickCount: 10 });
    expect(engagementRate(saved)).toBeGreaterThan(engagementRate(liked));
    expect(engagementRate(clicked)).toBeGreaterThan(engagementRate(saved));
  });

  it("does not let two views decide anything", () => {
    // One like on one view is a 100% rate and would beat every established post on the feed.
    const lucky = post({ id: "lucky", likeCount: 1, viewCount: 1 });
    const solid = post({ id: "solid", saveCount: 30, viewCount: 100 });
    expect(engagementRate(lucky)).toBeLessThanOrEqual(engagementRate(solid));
  });

  it("gives an unseen post a baseline instead of zero", () => {
    // Otherwise nothing new is ever shown, because it has no engagement, because it is never
    // shown. The feed would only ever promote what it had already promoted.
    expect(engagementRate(post({ id: "unseen", viewCount: 0 }))).toBeCloseTo(
      WEIGHTS.unseenBaselineRate,
    );
  });

  it("survives a row without counts rather than poisoning the page with NaN", () => {
    // A single NaN score makes every comparison false and the whole page comes back in whatever
    // order the sort happened to leave it.
    const broken = { ...post({ id: "broken" }), viewCount: undefined as never };
    expect(Number.isFinite(engagementRate(broken))).toBe(true);
  });
});

describe("recencyDecay", () => {
  it("halves over the half-life and never goes negative", () => {
    const halfLifeAgo = new Date(
      NOW.getTime() - WEIGHTS.recencyHalfLifeHours * 3_600_000,
    );
    expect(recencyDecay(post({ id: "a" }), NOW)).toBeCloseTo(1);
    expect(
      recencyDecay(post({ id: "b", publishedAt: halfLifeAgo }), NOW),
    ).toBeCloseTo(0.5);
    const ancient = new Date(NOW.getTime() - 400 * 3_600_000);
    expect(
      recencyDecay(post({ id: "c", publishedAt: ancient }), NOW),
    ).toBeGreaterThan(0);
  });

  it("scores an unpublished post at zero rather than crashing", () => {
    expect(recencyDecay(post({ id: "d", publishedAt: null }), NOW)).toBe(0);
  });
});

describe("scorePost", () => {
  it("puts personal signal above popularity", () => {
    // The product decision this feed is built on: the seller you already buy from comes before
    // whatever happens to be popular.
    const signals = buildViewerSignals([
      { type: "SAVE", post: { authorId: "mine", products: [] } },
      { type: "SAVE", post: { authorId: "mine", products: [] } },
      { type: "SAVE", post: { authorId: "mine", products: [] } },
    ]);
    const known = post({ id: "known", authorId: "mine" });
    const popular = post({ id: "popular", saveCount: 20, viewCount: 100 });
    expect(scorePost(known, signals, NOW).total).toBeGreaterThan(
      scorePost(popular, signals, NOW).total,
    );
  });

  it("caps author affinity so one good week cannot pin a seller forever", () => {
    const devoted = buildViewerSignals(
      Array.from({ length: 200 }, () => ({
        type: "SAVE",
        post: { authorId: "mine", products: [] },
      })),
    );
    const breakdown = scorePost(post({ id: "x", authorId: "mine" }), devoted, NOW);
    expect(breakdown.authorAffinity).toBe(
      WEIGHTS.authorAffinityCap * WEIGHTS.authorAffinity,
    );
  });

  it("rewards a post that carries something buyable", () => {
    const plain = post({ id: "plain" });
    const selling = post({ id: "selling", products: [{ productId: "p1" }] });
    expect(scorePost(selling, NO_SIGNALS, NOW).total).toBeGreaterThan(
      scorePost(plain, NO_SIGNALS, NOW).total,
    );
  });

  it("adds up to the sum of its named parts, so a page can explain itself", () => {
    const b = scorePost(
      post({ id: "v", mediaType: "VIDEO", products: [{ productId: "p" }] }),
      NO_SIGNALS,
      NOW,
    );
    expect(b.total).toBeCloseTo(
      b.authorAffinity + b.productAffinity + b.engagement + b.format + b.recency,
    );
  });
});

describe("rankPage", () => {
  it("keeps every post it was given", () => {
    // Ranking arranges, it never filters. Membership belongs to the cursor, and a rank that drops
    // a post drops it for good -- that is exactly how the feed once shrank to two posts.
    const posts = Array.from({ length: 7 }, (_, i) =>
      post({ id: `p${i}`, authorId: i < 5 ? "a1" : "a2" }),
    );
    expect(rankPage(posts, NO_SIGNALS, NOW)).toHaveLength(7);
  });

  it("sends a third post by the same author behind the others", () => {
    const posts = [
      post({ id: "a-1", authorId: "a" }),
      post({ id: "a-2", authorId: "a" }),
      post({ id: "a-3", authorId: "a" }),
      post({ id: "b-1", authorId: "b" }),
    ];
    const order = rankPage(posts, NO_SIGNALS, NOW).map((p) => p.id);
    expect(order.indexOf("b-1")).toBeLessThan(order.indexOf("a-3"));
    expect(order).toHaveLength(4);
  });

  it("leaves a page written by one author whole and in order", () => {
    // The case this feed actually has: one seller, everything they publish.
    const posts = Array.from({ length: 5 }, (_, i) =>
      post({
        id: `p${i}`,
        publishedAt: new Date(NOW.getTime() - i * 3_600_000),
      }),
    );
    const order = rankPage(posts, NO_SIGNALS, NOW).map((p) => p.id);
    expect(order.slice(0, MAX_LEADING_PER_AUTHOR)).toEqual(["p0", "p1"]);
    expect(order).toHaveLength(5);
  });

  it("is stable: the same input gives the same order twice", () => {
    // Two identical requests that disagree would shuffle the feed under a reader's thumb.
    const posts = [
      post({ id: "x", publishedAt: NOW }),
      post({ id: "y", publishedAt: NOW }),
      post({ id: "z", publishedAt: NOW }),
    ];
    const once = rankPage(posts, NO_SIGNALS, NOW).map((p) => p.id);
    const twice = rankPage([...posts].reverse(), NO_SIGNALS, NOW).map(
      (p) => p.id,
    );
    expect(once).toEqual(twice);
  });
});

describe("buildViewerSignals", () => {
  it("counts a save heavier than a like", () => {
    const signals = buildViewerSignals([
      { type: "LIKE", post: { authorId: "a", products: [] } },
      { type: "SAVE", post: { authorId: "b", products: [] } },
    ]);
    expect(signals.authorAffinity.get("b")).toBeGreaterThan(
      signals.authorAffinity.get("a")!,
    );
  });

  it("remembers the products behind the posts, not just their authors", () => {
    const signals = buildViewerSignals([
      {
        type: "PRODUCT_CLICK",
        post: { authorId: "a", products: [{ productId: "rose" }] },
      },
    ]);
    expect(signals.productAffinity.has("rose")).toBe(true);
  });
});
