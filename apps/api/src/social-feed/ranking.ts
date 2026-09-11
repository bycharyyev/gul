/**
 * Feed ranking.
 *
 * Shaped after the pipeline X open-sourced — candidate sources, a scorer built from predicted
 * engagement, then heuristics that shape the page — and deliberately not a port of it. Theirs is a
 * distributed machine-learning system: embeddings over a follow graph, community detection, and a
 * neural ranker trained on billions of logged events. This feed has three posts, one author and no
 * training data. Copying the architecture would give us the cost and none of the benefit; copying
 * the *shape* gives a feed that behaves sensibly now and has somewhere to grow.
 *
 * What is kept from that shape:
 *
 *   - **Sources, then scoring, then heuristics.** Which posts may appear is decided by chronology
 *     alone (see `list` in the service); ranking only decides their order. This is not a style
 *     choice: `nextCursor` is a point in publication time, so if scoring could decide membership,
 *     a page could end on a post newer than one already shown and the next page would repeat it.
 *   - **A score made of separate, named signals**, each capped, so no single one can run away.
 *   - **Heuristics applied after scoring, never inside it** — author spread, and a floor for posts
 *     nobody has seen yet.
 *
 * What is deliberately left out: any learned weight. Every number below was chosen by hand and is
 * explained where it is defined. When there is enough traffic to measure engagement per surface,
 * these become the baseline to beat, not a thing to defend.
 *
 * Pure functions on plain data: no Prisma, no Nest, no clock. That is what makes the weights
 * testable at all — see ranking.spec.ts.
 */

/** Everything the scorer reads from a post. A structural type, so any row with these fields fits. */
export interface RankablePost {
  id: string;
  authorId: string;
  publishedAt: Date | null;
  likeCount: number;
  saveCount: number;
  viewCount: number;
  productClickCount: number;
  commentCount: number;
  mediaType: string;
  products: { productId: string }[];
}

/** What the viewer's own history says. Empty for a signed-out reader, which is a valid case. */
export interface ViewerSignals {
  /** authorId -> weight built from the viewer's likes, saves and product clicks. */
  authorAffinity: Map<string, number>;
  /** Products the viewer has engaged with, in any post. */
  productAffinity: Set<string>;
}

export const NO_SIGNALS: ViewerSignals = {
  authorAffinity: new Map(),
  productAffinity: new Set(),
};

/**
 * Every weight in one place, so the ranking can be read without reading the code.
 *
 * The scale is arbitrary but the ratios are not: personal signal outranks popularity, popularity
 * outranks freshness, and freshness only breaks ties. That ordering is the actual product
 * decision — a feed for a shop should show you the seller you already buy from before it shows
 * you whatever is newest.
 */
export const WEIGHTS = {
  /**
   * A viewer who saves an author's posts wants more of them. The strongest single signal, and
   * deliberately strong enough to beat popularity: this is a shop's feed, and the seller somebody
   * already buys from should come before whatever happens to be popular with strangers.
   */
  authorAffinity: 3.0,
  /**
   * Capped, or one enthusiastic week with a seller would pin them to the top for ever. At the cap
   * an author the viewer keeps saving is worth a little more than a perfect engagement rate — which
   * is the ordering this feed is built on, stated as a number.
   */
  authorAffinityCap: 15,

  /** A tagged product the viewer already engaged with. Commerce intent beats general interest. */
  productAffinity: 12,

  /**
   * Engagement per view, not engagement in total. A post seen by ten people and saved by three is
   * a better post than one seen by a thousand and saved by five; ranking on raw counts would just
   * rank on age, because old posts have had longer to collect them.
   */
  engagementRate: 40,

  /** A save is a stronger statement than a like; a product click is stronger still — it is intent. */
  likeValue: 1,
  saveValue: 3,
  commentValue: 2,
  productClickValue: 4,

  /**
   * Imaginary views every post is credited with, at the baseline rate, before its real numbers
   * count. This is what stops one like on one view from scoring a perfect rate and beating the
   * whole feed — the small-denominator problem. Higher means slower to trust, and evidence
   * overtakes the prior once a post has a few times this many real views.
   */
  priorViews: 20,

  /** Video holds attention in a full-screen feed in a way a still image does not. */
  videoBonus: 3,

  /** A post carrying something buyable is what this feed is for. */
  hasProductBonus: 4,

  /**
   * Halving time for freshness, in hours. Deliberately long: a shop posts a few times a week, not
   * a few times an hour, and a short half-life would bury a good post by Tuesday.
   */
  recencyHalfLifeHours: 36,
  recency: 10,

  /**
   * A post nobody has seen yet cannot have an engagement rate, and would sit at the bottom for
   * ever — the cold-start trap, where the feed can only promote what it has already promoted.
   * Unseen posts are scored as if they were doing averagely, so they get their turn.
   */
  unseenBaselineRate: 0.15,
} as const;

/** How many posts by one author may take the leading positions of a page. */
export const MAX_LEADING_PER_AUTHOR = 2;

/** The pieces a score is made of, kept so a page can explain itself. */
export interface ScoreBreakdown {
  authorAffinity: number;
  productAffinity: number;
  engagement: number;
  format: number;
  recency: number;
  total: number;
}

/**
 * Weighted engagement per view, smoothed towards the baseline.
 *
 * A raw rate is meaningless on small numbers — one like on one view is 100% — so every post is
 * credited with `priorViews` imaginary views at the baseline rate. Early numbers barely move the
 * result; real ones take over as the evidence arrives.
 */
/**
 * A counter as a number the arithmetic can survive.
 *
 * Not defensive decoration: one NaN score makes every comparison against it false, `sort` then
 * orders the page arbitrarily, and the reader gets a shuffled feed with nothing in any log to say
 * why. A row that is missing a counter is scored as a zero and the rest of the page is unaffected.
 */
function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function engagementRate(post: RankablePost): number {
  const weighted =
    count(post.likeCount) * WEIGHTS.likeValue +
    count(post.saveCount) * WEIGHTS.saveValue +
    count(post.commentCount) * WEIGHTS.commentValue +
    count(post.productClickCount) * WEIGHTS.productClickValue;
  // Smoothed towards the baseline rather than divided by the raw view count. A post with one view
  // and one like has a 100% rate and would beat everything on the feed on the strength of a single
  // tap; adding `priorViews` imaginary views at the baseline rate makes early numbers count for
  // little and real ones count for more as the evidence arrives. It also removes the division by
  // zero for a post nobody has opened, which then scores exactly the baseline.
  const views = count(post.viewCount);
  const prior = WEIGHTS.priorViews;
  return (weighted + prior * WEIGHTS.unseenBaselineRate) / (views + prior);
}

/** Exponential decay on age, halving every `recencyHalfLifeHours`. 1 for a post published now. */
export function recencyDecay(post: RankablePost, now: Date): number {
  const published = post.publishedAt?.getTime();
  if (published === undefined) return 0;
  const ageHours = Math.max(0, (now.getTime() - published) / 3_600_000);
  return Math.pow(0.5, ageHours / WEIGHTS.recencyHalfLifeHours);
}

/** The score, and the parts it was made of. */
export function scorePost(
  post: RankablePost,
  signals: ViewerSignals,
  now: Date,
): ScoreBreakdown {
  const authorAffinity =
    Math.min(
      WEIGHTS.authorAffinityCap,
      signals.authorAffinity.get(post.authorId) ?? 0,
    ) * WEIGHTS.authorAffinity;

  const matchedProducts = (post.products ?? []).filter((x) =>
    signals.productAffinity.has(x.productId),
  ).length;
  const productAffinity = matchedProducts * WEIGHTS.productAffinity;

  const engagement = engagementRate(post) * WEIGHTS.engagementRate;

  const format =
    (post.mediaType === "VIDEO" ? WEIGHTS.videoBonus : 0) +
    ((post.products?.length ?? 0) > 0 ? WEIGHTS.hasProductBonus : 0);

  const recency = recencyDecay(post, now) * WEIGHTS.recency;

  return {
    authorAffinity,
    productAffinity,
    engagement,
    format,
    recency,
    total: authorAffinity + productAffinity + engagement + format + recency,
  };
}

/**
 * Orders one page. Membership is already fixed by the caller; this only arranges.
 *
 * Two rules, applied in this order:
 *
 *  1. **Author spread.** A third post by the same author goes behind everything else, so a page
 *     shared with other sellers cannot open with one of them three times over. It is an ordering
 *     rule and never a filter: a page written entirely by one author keeps all of it, which is
 *     what a young feed needs. (It used to be a filter, and it deleted the feed — the cap dropped
 *     posts and the cursor moved past them, so a feed with one active seller served two posts and
 *     reported the end.)
 *  2. **Score**, then publication time, then id — the last two only so the order is total and a
 *     page never arrives shuffled between two identical requests.
 */
export function rankPage<T extends RankablePost>(
  posts: T[],
  signals: ViewerSignals,
  now: Date,
): T[] {
  // Which of an author's posts counts as their third is decided on publication order, not on the
  // order the caller happened to pass. Otherwise the same page, handed over shuffled, would demote
  // a different post and two identical requests could disagree.
  const byPublication = [...posts].sort(
    (a, b) =>
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
      b.id.localeCompare(a.id),
  );
  const seenByAuthor = new Map<string, number>();
  const demoted = new Map<string, boolean>();
  for (const post of byPublication) {
    const seen = seenByAuthor.get(post.authorId) ?? 0;
    seenByAuthor.set(post.authorId, seen + 1);
    demoted.set(post.id, seen >= MAX_LEADING_PER_AUTHOR);
  }

  const scores = new Map(
    posts.map((post) => [post.id, scorePost(post, signals, now).total]),
  );

  return [...posts].sort((a, b) => {
    const demotion =
      Number(demoted.get(a.id) ?? false) - Number(demoted.get(b.id) ?? false);
    if (demotion !== 0) return demotion;
    const byScore = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (byScore !== 0) return byScore;
    const byTime =
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
}

/**
 * Turns the viewer's recent history into the two affinity signals.
 *
 * One pass over one query's worth of rows. The weights say what an action costs a person: a like
 * is a tap, a save is a decision, a product click is someone considering money.
 */
export function buildViewerSignals(
  history: {
    type: string;
    post: { authorId: string; products: { productId: string }[] };
  }[],
): ViewerSignals {
  const authorAffinity = new Map<string, number>();
  const productAffinity = new Set<string>();
  for (const action of history) {
    const weight =
      action.type === "SAVE"
        ? WEIGHTS.saveValue
        : action.type === "PRODUCT_CLICK"
          ? WEIGHTS.productClickValue - 2
          : WEIGHTS.likeValue;
    authorAffinity.set(
      action.post.authorId,
      (authorAffinity.get(action.post.authorId) ?? 0) + weight,
    );
    for (const tagged of action.post.products)
      productAffinity.add(tagged.productId);
  }
  return { authorAffinity, productAffinity };
}
