-- Read-only. What does the database think exists, versus what the drift check found sitting on
-- disk (a vhost for managed-test1.gulyaly.pro, TLS-invalid because gul-cert-sync has no install
-- path on either host). Answers whether that vhost is a live feature or leftover from testing.

\echo '=== managed subdomains ==='
SELECT name, "targetPort", status, "lastError",
       to_char("createdAt", 'YYYY-MM-DD HH24:MI') AS created
FROM "ManagedSubdomain"
ORDER BY "createdAt" DESC;
