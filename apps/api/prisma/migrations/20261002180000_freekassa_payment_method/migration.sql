-- FreeKassa card/SBP payment method (ADR-0005 step 3). Inserted DISABLED: it is switched on in
-- the admin only after a sandbox payment has gone through end to end. Leaves an existing CARD row
-- untouched.
INSERT INTO "PaymentMethod" ("id", "code", "name", "provider", "feePercent", "isEnabled", "sortOrder")
VALUES ('pm_freekassa_card', 'CARD', 'Банковская карта / СБП', 'freekassa', 0, false, 2)
ON CONFLICT ("code") DO NOTHING;
