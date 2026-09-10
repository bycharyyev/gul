-- Referral codes become numbers issued in order, starting at 1000.
--
-- Until now a code was either an 8-character random string or -- for every account created before
-- the referrals feature existed -- that account's own cuid, left behind by the backfill in
-- 20260822150000 which called itself temporary. Neither is something a person will read out to a
-- friend, and the app now shows the code prominently, so the difference matters.

CREATE SEQUENCE IF NOT EXISTS "referral_code_seq" START WITH 1000;

-- The old value has to survive the renumbering: `User.referredByUsername` stores whoever invited
-- this account *by code*, so rewriting codes without rewriting those references would silently
-- detach every existing invitation from its referrer.
CREATE TEMPORARY TABLE "_referral_code_remap" (
  user_id TEXT PRIMARY KEY,
  old_username TEXT NOT NULL,
  new_username TEXT NOT NULL
);

-- Oldest account gets the lowest number: the sequence then reads as a join order rather than as
-- an arbitrary shuffle.
INSERT INTO "_referral_code_remap" (user_id, old_username, new_username)
SELECT id,
       username,
       (999 + row_number() OVER (ORDER BY "createdAt", id))::text
FROM "User";

-- Hand the sequence the same numbers this migration just consumed, so the next registration
-- continues the run instead of colliding with an account that already exists.
SELECT setval('referral_code_seq', 999 + (SELECT COUNT(*) FROM "User"), true);

-- Two passes, because `username` is UNIQUE: assigning the new codes directly would transiently
-- put two rows on the same value part-way through the statement and trip the index.
UPDATE "User" SET username = 'migrating_' || id;

UPDATE "User" u
SET username = m.new_username
FROM "_referral_code_remap" m
WHERE m.user_id = u.id;

-- Only codes that belonged to a *user* are remapped. A `referredByUsername` holding a seller's
-- handle matches nothing here and is left exactly as it was.
UPDATE "User" u
SET "referredByUsername" = m.new_username
FROM "_referral_code_remap" m
WHERE u."referredByUsername" = m.old_username;

DROP TABLE "_referral_code_remap";
