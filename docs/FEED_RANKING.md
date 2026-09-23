# Feed ranking

How `/social-feed` decides the order of a page. The code is
[`apps/api/src/social-feed/ranking.ts`](../apps/api/src/social-feed/ranking.ts); every weight in it
is tested in `ranking.spec.ts`. This document exists so the ranking can be argued with without
reading the code.

## Where it came from

Shaped after the pipeline X open-sourced — candidate sources, a scorer built from predicted
engagement, then heuristics that shape the page — and deliberately **not** a port of it. Theirs is
a distributed machine-learning system: embeddings over a follow graph, community detection, and a
neural ranker trained on billions of logged events. This feed has three posts, one author and no
training data. Copying that architecture buys the cost and none of the benefit.

What is kept is the *shape*:

| From that design | What it is here |
| --- | --- |
| Candidate sources, then scoring, then heuristics | Chronology decides membership; ranking only decides order |
| A score made of separate, capped signals | Five named parts, each with its own ceiling |
| Heuristics after the scorer, never inside it | Author spread; a floor for unseen posts |
| Learned weights | **Left out.** Every number is chosen by hand and explained below |

## The one rule that is not negotiable

**Ranking arranges. It never filters.**

`nextCursor` is a point in publication time. If scoring could decide *which* posts appear, a page
could end on a post newer than one already shown, and the next page would repeat it — or, worse,
skip it for ever. That is not theoretical: the per-author cap used to drop posts while the cursor
moved past them anyway, and a feed where one seller writes everything served **two posts and then
declared itself over**, permanently, however much that seller published. Membership belongs to the
cursor. Anything a rank function does must be undoable by scrolling.

## The score

`scorePost(post, signals, now)` returns five parts and their total. The scale is arbitrary; the
*ratios* are the product decision — personal signal outranks popularity, popularity outranks
freshness, and freshness only breaks ties. This is a marketplace feed: the seller you already buy
from should come before whatever is popular with strangers.

### 1. Author affinity — up to 45

`min(15, affinity) × 3.0`, where affinity is built from the viewer's own recent history: a like is
worth 1, a product click 2, a save 3. A like is a tap; a save is a decision; a product click is
someone considering money.

Capped at 15 — five saves — so one enthusiastic week with a seller cannot pin them to the top for
ever. At the cap this signal is worth slightly more than a perfect engagement rate, which is the
stated ordering expressed as a number.

For a signed-out reader this part is always 0, and the feed degrades to popularity and freshness.
That is a supported case, not a fallback.

### 2. Product affinity — 12 per matching product

A post tagged with a product the viewer has already engaged with. Commerce intent beats general
interest; this is a shop.

### 3. Engagement — up to 40

`engagementRate(post) × 40`, where the rate is weighted engagement **per view**:

```
1·likes + 3·saves + 2·comments + 4·product clicks  +  20 × 0.15
---------------------------------------------------------------
                        views + 20
```

Two deliberate choices:

- **Per view, not in total.** A post seen by ten people and saved by three is better than one seen
  by a thousand and saved by five. Ranking on raw counts is really ranking on age, because old
  posts have had longer to collect them.
- **Smoothed by 20 imaginary views at the baseline rate.** A raw rate is meaningless on small
  numbers — one like on one view is 100%, and would beat the whole feed on a single tap. The prior
  makes early numbers count for little and lets real ones take over as the evidence arrives. It
  also removes the division by zero.

A post nobody has opened therefore scores exactly the baseline, 0.15. Without that floor nothing
new is ever shown, because it has no engagement, because it is never shown — the cold-start trap,
where the feed can only promote what it has already promoted.

### 4. Format — 0, 3, 4 or 7

`+3` for video: it holds attention in a full-screen feed in a way a still image does not. `+4` for
carrying something buyable, which is what this feed is for.

### 5. Recency — up to 10

`0.5 ^ (ageHours / 36) × 10`. The half-life is deliberately long: a shop posts a few times a week,
not a few times an hour, and a short half-life would bury a good post by Tuesday. A post with no
`publishedAt` scores 0 rather than throwing.

## The page heuristics

`rankPage(posts, signals, now)` applies two rules, in this order:

1. **Author spread.** A third post by the same author sorts behind everything else, so a page
   shared with other sellers cannot open with one of them three times over
   (`MAX_LEADING_PER_AUTHOR = 2`). Which post counts as the third is decided on *publication*
   order, not on the order the caller happened to pass — otherwise the same page handed over
   shuffled would demote a different post. This is an ordering rule and never a filter: a page
   written entirely by one author keeps all of it, which is exactly what a young feed needs.
2. **Score, then publication time, then id.** The last two only so the order is *total*. Two
   identical requests must not disagree; a feed that reshuffles under a reader's thumb is a bug
   they will report as "it jumps".

## Robustness

Every counter is coerced through `count()` before arithmetic. This is not defensive decoration: one
`NaN` score makes every comparison against it false, `sort` then orders the whole page arbitrarily,
and the reader gets a shuffled feed with nothing in any log to say why. A row missing a counter
scores that part as zero and the rest of the page is unaffected.

`ranking.ts` is pure functions over plain data — no Prisma, no Nest, no clock; `now` is a
parameter. That is the only reason the weights are testable at all.

## Cost

One extra query per personalised request: the viewer's recent interactions, read once and folded
into two maps. Scoring is arithmetic over the page already in memory — a page of 20, not a table
scan. A signed-out request skips the query entirely.

## Changing it

Every weight lives in one `WEIGHTS` object, so the ranking can be re-tuned without reading the code
that applies it. The tests assert *relationships* (a save outranks a like; personal signal outranks
popularity; the page never loses a post), not exact totals, so honest tuning stays green while a
change that inverts the product decision does not.

When there is enough traffic to measure engagement per surface, these hand-picked numbers become
the baseline to beat — not a thing to defend. The obvious next steps, in order of value:

1. Log the `ScoreBreakdown` of served pages, so there is data to argue from at all.
2. A viewed-post memory, so the feed stops re-ranking posts the reader has already scrolled past.
3. Author affinity decayed by time, not only capped.
