-- Read-only. Which seller accounts exist, and are they usable for a manual test right now.
--
-- Phones and shop names are shown: this is staff-only tooling (dispatched by hand via
-- workflow_dispatch) and the point of the query is to hand back something a person can actually
-- log in with, not to describe the data in the abstract.

\echo '=== sellers ==='
SELECT u.phone,
       s.handle,
       s."shopName",
       s."isEnabled",
       u."isBlocked",
       to_char(u."createdAt", 'YYYY-MM-DD') AS created
FROM "Seller" s
JOIN "User" u ON u.id = s."userId"
ORDER BY u."createdAt" DESC;

\echo '=== pending applications (not yet sellers) ==='
SELECT phone, "shopName", status, to_char("createdAt", 'YYYY-MM-DD') AS created
FROM "SellerApplication"
ORDER BY "createdAt" DESC
LIMIT 10;
