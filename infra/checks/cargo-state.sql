-- Read-only: what does the Cargo vertical actually hold right now?
--
-- Written right after the weight-bracket/USD-cross-rate pricing rework (2026-09-04) to confirm the
-- seeded Moscow->Ashgabat route/tariff/exchange-rate landed correctly, and kept around since
-- "has anyone actually placed a shipment yet" is exactly the kind of thing a green deploy can't
-- answer -- useful again for the next schema change touching Shipment (e.g. adding paymentMethodId),
-- to confirm whether a NOT NULL column is still safe to add outright or needs a backfill.

\echo '=== routes ==='
SELECT id, "originCity", "destinationCity", "isEnabled" FROM "CargoRoute" ORDER BY "createdAt";

\echo '=== active tariff brackets per route ==='
SELECT r."originCity", r."destinationCity", t."minWeightKg", t."pricePerKgRub", t."pickupFeeRub"
FROM "CargoTariff" t
JOIN "CargoRoute" r ON r.id = t."routeId"
WHERE t."isActive" = true
ORDER BY r."originCity", t."minWeightKg";

\echo '=== exchange rate ==='
SELECT "rubPerUsd", "tmtPerUsd", "updatedAt" FROM "CargoExchangeRate" WHERE id = 'singleton';

\echo '=== shipments: total and by status ==='
SELECT count(*) AS total FROM "Shipment";
SELECT status, count(*) FROM "Shipment" GROUP BY status ORDER BY status;
