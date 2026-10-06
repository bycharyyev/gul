-- Heleket crypto payment method (ADR-0005 step 3). Inserted DISABLED: switched on in the admin only
-- after a real test payment has gone through end to end. Leaves an existing CRYPTO row untouched.
INSERT INTO "PaymentMethod" ("id", "code", "name", "provider", "feePercent", "isEnabled", "sortOrder")
VALUES ('pm_heleket_crypto', 'CRYPTO', 'Криптовалюта (USDT, BTC и др.)', 'heleket', 0, false, 3)
ON CONFLICT ("code") DO NOTHING;
