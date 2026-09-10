# ADR-0007: Moderated social-commerce feed

## Status

Accepted — 2026-09-09.

## Decision

The social feed is a separate bounded context, not an extension of Gallery or the marketing Stories feature. A post is user generated content with optional tags to **existing enabled GalleryProduct records**. It never stores a seller-supplied URL, price, or checkout target; the Gallery product remains the source of truth for product availability and price.

Posts and comments begin as `PENDING`. Only `PUBLISHED` posts/comments are visible to public clients. A staff member may publish, reject, or hide a post; the action is audit logged. Editing an approved post returns it to moderation. Reports are deliberately visible only in the moderation database view, never in a public post response.

Media is an immutable upload reference owned by Gulyaly storage (`/api/uploads/*` in local development or the configured public S3 upload prefix). The API rejects arbitrary remote URLs; it does not fetch, scrape, proxy, or inspect a customer-supplied host. Video ingestion must add server-side MIME, size and duration validation before enabling video upload. Until then, a video post may reference only a trusted asset produced by the media pipeline.

Feed pagination is cursor based, ordered by `(publishedAt DESC, id DESC)`. It caps two posts per author in a page. This is the safe chronological fallback. Interaction records have a composite idempotency key `(postId, userId, type)`; counters change only if the insert/delete wins, making retries safe. A future personalized ranker may use capped completed views/product clicks and like/save affinity only as a modest ordering signal inside this chronological candidate window; it must preserve the deterministic cursor and diversity caps.

## Consequences

- No unaudited, external content or price can become a purchasable product.
- A viral item cannot bypass moderation or monopolize a page merely by engagement.
- The product needs a trusted video upload/transcode pipeline before accepting raw user video.
- Admin reviews use explicit status transitions and do not reveal reporters to content authors.
