-- Card and SBP become two methods (2026-11-20). FreeKassa's hosted form shows a card form only
-- when asked for one (`i`), so one "card / SBP" button could offer just one of them. CARD keeps
-- its row and is renamed only if nobody renamed it in the admin; SBP is new, enabled, right
-- after it. Both go through the freekassa adapter, which maps CARD -> 36 and SBP -> 42.
UPDATE "PaymentMethod" SET "name" = 'Банковская карта'
WHERE "id" = 'pm_freekassa_card' AND "name" = 'Банковская карта / СБП';

INSERT INTO "PaymentMethod" ("id", "code", "name", "provider", "feePercent", "isEnabled", "sortOrder")
VALUES ('pm_freekassa_sbp', 'SBP', 'СБП', 'freekassa', 0, true, 3)
ON CONFLICT ("code") DO NOTHING;
