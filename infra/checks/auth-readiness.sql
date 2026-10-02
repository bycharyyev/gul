-- Read-only. Who could still sign in once sign-in is by email only (2026-10-02).
--
-- An account without an email cannot sign in at all after the switch. Staff and sellers are
-- listed by name so each one can be asked to add (and verify) an address in their profile first;
-- customers are only counted. Addresses are masked: whether one exists is the question, not what it is.

\echo '=== accounts by role: with / without an email ==='
SELECT role,
       count(*) FILTER (WHERE email IS NOT NULL)                    AS with_email,
       count(*) FILTER (WHERE email IS NOT NULL AND "emailVerified") AS verified,
       count(*) FILTER (WHERE email IS NULL)                        AS without_email
FROM "User"
GROUP BY role
ORDER BY role;

\echo '=== staff and sellers ==='
SELECT role,
       coalesce("fullName", username)                                     AS name,
       CASE WHEN email IS NULL THEN '(none)'
            ELSE left(email, 2) || '***@' || split_part(email, '@', 2) END AS email,
       "emailVerified"                                                    AS verified,
       "isBlocked"                                                        AS blocked
FROM "User"
WHERE role <> 'CUSTOMER'
ORDER BY role, name;
