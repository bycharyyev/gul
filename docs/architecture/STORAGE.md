# File storage: S3-compatible (reg.ru)

Avatars and documents were the only two real file-upload paths when this was first built. As of
2026-08-29, every remaining plain `imageUrl`/`logoUrl` string field across the app also has real
upload capability, backed by the same S3 account, via one shared general-purpose endpoint.

## Setup

One reg.ru S3 account, two buckets, shared access key pair:
- **`open`** — public. Has a bucket policy granting anonymous `s3:GetObject` on everything in it.
  Avatars go here; the upload response and `/auth/me`'s `avatarUrl` are the direct object URL
  (`https://open.s3.regru.cloud/avatars/<uuid>.<ext>`) — no request touches the API to view one.
- **`stor`** — private. No bucket policy, so a GET without valid SigV4 auth is a straight 403.
  Documents go here; `GET /api/documents/:id` still checks ownership exactly as before, then
  302-redirects to a 60-second presigned URL rather than proxying the bytes itself.

`apps/api/src/storage/storage.service.ts` (a global module, `StorageModule`) wraps both. Env vars
(`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BUCKET`,
`S3_PRIVATE_BUCKET`) are optional — unset, everything falls back to local disk exactly as before
(same pattern as `MAIL_HOST` being optional). Wired into both `/opt/gul/.env` and
`/opt/gul-secondary/.env` via `.github/workflows/wire-s3-env.yml`.

`avatarPath` distinguishes local-vs-S3 by format alone (a stored URL vs. a bare filename) — no
migration needed for existing rows, `auth.service.ts`'s `toAvatarUrl()` handles both. `Document`
got an explicit `storageBackend` column (`"local"` | `"s3"`, defaults `"local"`) instead, since a
bare UUID `storedName` can't be told apart by format the way a URL can.

## General-purpose image upload (2026-08-29)

`POST /api/uploads/image` (`apps/api/src/uploads/`) — JWT-guarded, any authenticated user (same
trust level as avatar upload), uploads to the `open` bucket under `uploads/<uuid>.<ext>`, returns
`{ url }`. No owning DB record, unlike avatar/documents: authorization for what the returned URL
gets attached to belongs to whichever entity's own upsert endpoint the caller then calls, not to
this endpoint. Falls back to local disk + `GET /api/uploads/:storedName` when S3 isn't configured,
same pattern as everything else here.

Exposed to the frontend via `ApiClient.uploadImage(file)` in `packages/api-client`, and wired into
an `ImageUploadField` component (separate copies in `apps/admin` and `apps/web`, per this repo's
existing convention of duplicating UI primitives between the two apps rather than sharing them) —
a URL text input (for pasting an already-hosted image) plus a real upload button. Used by every
remaining plain URL field that had no upload capability before: `Service.logoUrl` (catalog),
`Story.imageUrl`, `HomeSlide.imageUrl` (all `apps/admin`), and — the seller-facing side —
`GalleryProduct.imageUrl` (seller's own products) and `Seller.logoUrl` (shop settings), both in
`apps/web/src/app/seller/*`. `SocialLink.url` was deliberately left alone: it's a link to an
external profile, not an image, uploading a file for it wouldn't make sense.

## Verified end-to-end (2026-08-28/29) against the real buckets, not just typechecked

- Public bucket: `PUT` then a plain `fetch()` of the object → `200`.
- Private bucket without any auth → `403`.
- Private bucket via a presigned GET → `200`.
- Through the actual deployed API: uploaded a real avatar (got back a direct `open` bucket URL,
  fetched it → `200`, `/auth/me` reflected it, delete removed both the DB field and the S3
  object), and a real document (`storageBackend: "s3"` in the response, `GET
  /api/documents/:id` → `302` to a valid presigned URL, delete cleaned up).
- `POST /api/uploads/image`: real upload → direct `open` bucket URL, fetched it → `200`, deleted
  the object afterward.
- The `ImageUploadField` UI itself was click-tested for real in a browser against the actual
  production admin (`admin.gulyaly.pro`, real login, catalog → TMCELL's logo field) — clicking
  "Загрузить" opens the file picker correctly; a file selected through it round-tripped through
  the real network request and populated the field with a genuine `open` bucket URL, with the
  preview image rendering successfully (no `onError` fallback triggered). Discarded the unsaved
  form change afterward (confirmed via the API that `TMCELL.logoUrl` stayed `null`) and deleted
  the test object from S3.

## What this resolves

The uploads-volume-not-synced-to-secondary gap noted in
[HIGH_AVAILABILITY.md](HIGH_AVAILABILITY.md) is fixed for avatars/documents specifically now that
they live in S3 (reachable from either node, not a per-host disk volume) — a failover no longer
loses or serves-stale files for these two paths. `HIGH_AVAILABILITY.md` still needs its own note
updated to reflect this (todo).

## Credentials

The S3 access key/secret are account-wide (not per-bucket) — same pair authenticates to both
buckets, `stor`'s lack of a public policy is what actually keeps it private. Stored as GitHub
repo secrets (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, etc.) and in both hosts' `.env` files —
never committed. If these ever need rotating, it's a reg.ru Cloud panel action (regenerate the key
pair there), then update the GitHub secrets and re-run `wire-s3-env.yml`.
