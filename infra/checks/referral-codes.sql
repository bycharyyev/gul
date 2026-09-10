-- Read-only integrity check for the referral renumbering (20260902120000).
-- Kept as a file rather than inline in the workflow: quoted identifiers like "User" do not
-- survive being passed through ssh, sh -c and psql -c, and silently become lowercase.

\echo '=== recent migrations applied ==='
SELECT migration_name, finished_at IS NOT NULL AS ok
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 5;

\echo '=== sequence position (next registration draws from here) ==='
SELECT last_value, is_called FROM referral_code_seq;

\echo '=== codes that are not plain numbers (expected: only ones staff set by hand) ==='
SELECT count(*) FROM "User" WHERE username !~ '^[0-9]+$';

\echo '=== lowest and highest number issued ==='
SELECT min(username::bigint) AS lowest, max(username::bigint) AS highest
FROM "User" WHERE username ~ '^[0-9]+$';

\echo '=== invitations pointing at a code nobody holds (must be 0) ==='
SELECT count(*)
FROM "User" u
WHERE u."referredByUsername" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r.username = u."referredByUsername")
  AND NOT EXISTS (SELECT 1 FROM "Seller" s WHERE s.handle = u."referredByUsername");
