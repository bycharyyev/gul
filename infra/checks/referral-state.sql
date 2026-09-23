-- Read-only: is the referral programme actually recording invitations in production?
--
-- Until 2026-09-02 the first thing to rule out was not a bug at all: `recordReferral` returned
-- immediately while the programme was switched off, so a signup supplying a perfectly valid code
-- wrote no Referral row and did not even set `referredByUsername`. To the person who shared the
-- link that was indistinguishable from a broken feature -- which is exactly how it was reported.
--
-- Attribution is now unconditional and only the *reward* is gated, so a missing Referral row for a
-- signup that named a code is a real bug again, whatever `enabled` says.

\echo '=== programme settings (enabled only gates the payout; invitations record either way) ==='
SELECT enabled, "customerRewardTmt", "sellerRewardTmt", "updatedAt" FROM "ReferralSettings";

\echo '=== accounts, and how many carry an inviter ==='
SELECT count(*) AS users,
       count(*) FILTER (WHERE "referredByUsername" IS NOT NULL) AS with_inviter
FROM "User";

\echo '=== Referral rows by status (one row per invited account) ==='
SELECT status, count(*) FROM "Referral" GROUP BY status ORDER BY status;

\echo '=== the 10 newest accounts: code they hold, code they arrived with ==='
-- Codes are public by nature: they are what an invitation link says out loud, so printing them
-- discloses nothing. Phones and names are deliberately not selected.
SELECT username,
       "referredByUsername" AS arrived_with,
       "referredById" IS NOT NULL AS linked_to_inviter,
       role,
       to_char("createdAt", 'YYYY-MM-DD HH24:MI') AS created
FROM "User"
ORDER BY "createdAt" DESC
LIMIT 10;

\echo '=== signups that named a code but produced no Referral row ==='
-- Non-zero is a real bug now, whether the programme is on or off. Rows dated before 2026-09-02
-- are the exception: they are the history of everyone who invited someone while attribution was
-- still gated on `enabled`, and nothing can recover those.
SELECT u.username, u."referredByUsername",
       to_char(u."createdAt", 'YYYY-MM-DD HH24:MI') AS created
FROM "User" u
WHERE u."referredByUsername" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Referral" r WHERE r."refereeUserId" = u.id)
ORDER BY u."createdAt" DESC
LIMIT 20;
