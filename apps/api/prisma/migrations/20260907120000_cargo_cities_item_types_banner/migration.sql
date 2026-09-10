-- Cargo v2: origin/destination become two independent lists, what is shipped decides how it is
-- priced, weight brackets stop being per-route, and the pages get an admin-managed ad slot.
--
-- migration-policy: allow-destructive CARGO-V2-DIRECTIONS-AND-ITEM-TYPES
-- Drops CargoRoute (replaced by CargoCity) and Shipment.cargoDescription/declaredValueTmt. Every
-- existing shipment is carried over: its route's city names are matched against the seeded cities
-- and its free-text description becomes the weight-priced default item type, which is what all
-- pre-existing shipments actually were. Reviewed as a one-time conversion; it cannot be paired
-- with an old-code rollback, and deploy.yml now refuses to attempt one for a migration carrying
-- this marker.

CREATE TYPE "CargoCityRole" AS ENUM ('ORIGIN', 'DESTINATION');
CREATE TYPE "CargoPricingUnit" AS ENUM ('PER_KG', 'PER_ITEM');

CREATE TABLE "CargoCity" (
  "id"        TEXT NOT NULL,
  "role"      "CargoCityRole" NOT NULL,
  "country"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CargoCity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CargoCity_role_name_key" ON "CargoCity"("role", "name");
CREATE INDEX "CargoCity_role_isEnabled_sortOrder_idx" ON "CargoCity"("role", "isEnabled", "sortOrder");

CREATE TABLE "CargoItemType" (
  "id"              TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "pricingUnit"     "CargoPricingUnit" NOT NULL,
  "pricePerItemRub" DECIMAL(10,2),
  "minWeightKg"     DECIMAL(6,2),
  "isEnabled"       BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CargoItemType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CargoItemType_code_key" ON "CargoItemType"("code");
CREATE INDEX "CargoItemType_isEnabled_sortOrder_idx" ON "CargoItemType"("isEnabled", "sortOrder");

CREATE TABLE "CargoBanner" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "subtitle"  TEXT,
  "imageUrl"  TEXT NOT NULL,
  "linkUrl"   TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "startsAt"  TIMESTAMP(3),
  "endsAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CargoBanner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CargoBanner_isEnabled_sortOrder_idx" ON "CargoBanner"("isEnabled", "sortOrder");

-- Seed the real lists. Deterministic ids so a later migration or an ops script can reference them
-- without a lookup, and so re-seeding an environment cannot produce duplicates under another name.
INSERT INTO "CargoCity" ("id", "role", "country", "name", "sortOrder") VALUES
  ('cargo_city_tm_ashgabat', 'DESTINATION', 'TM', 'Ашхабад',  1),
  ('cargo_city_tm_ahal',     'DESTINATION', 'TM', 'Ахал',     2),
  ('cargo_city_tm_mary',     'DESTINATION', 'TM', 'Мары',     3),
  ('cargo_city_tm_dashoguz', 'DESTINATION', 'TM', 'Дашогуз',  4),
  ('cargo_city_tm_lebap',    'DESTINATION', 'TM', 'Лебап',    5),
  ('cargo_city_tm_balkan',   'DESTINATION', 'TM', 'Балкан',   6),
  ('cargo_city_ru_moscow',   'ORIGIN', 'RU', 'Москва',           1),
  ('cargo_city_ru_spb',      'ORIGIN', 'RU', 'Санкт-Петербург',  2),
  ('cargo_city_ru_kazan',    'ORIGIN', 'RU', 'Казань',           3),
  ('cargo_city_ru_ekb',      'ORIGIN', 'RU', 'Екатеринбург',     4),
  ('cargo_city_ru_nsk',      'ORIGIN', 'RU', 'Новосибирск',      5),
  ('cargo_city_ru_nn',       'ORIGIN', 'RU', 'Нижний Новгород',  6),
  ('cargo_city_ru_samara',   'ORIGIN', 'RU', 'Самара',           7),
  ('cargo_city_ru_ufa',      'ORIGIN', 'RU', 'Уфа',              8);

-- MEDICINE's price is a placeholder: the partner has not quoted one yet (2026-09-07). It is
-- deliberately a real number rather than NULL so the type can be disabled instead of silently
-- quoting zero, and it is left DISABLED until the partner confirms.
INSERT INTO "CargoItemType"
  ("id", "code", "name", "description", "pricingUnit", "pricePerItemRub", "minWeightKg", "isEnabled", "sortOrder")
VALUES
  ('cargo_item_personal', 'PERSONAL_ITEMS', 'Личные вещи',
   'Одежда, обувь, бытовые товары. Считается по весу.', 'PER_KG', NULL, 5.00, true, 1),
  ('cargo_item_phone', 'PHONE', 'Телефоны и гаджеты',
   'Хрупкая техника, едет отдельным маршрутом. Считается поштучно.', 'PER_ITEM', 1000.00, NULL, true, 2),
  ('cargo_item_medicine', 'MEDICINE', 'Препараты и лекарства',
   'Считается поштучно. Цена предварительная, уточняется у партнёра.', 'PER_ITEM', 500.00, NULL, false, 3);

-- Weight brackets stop being per-route. Collapse whatever rows exist to one set per bracket,
-- keeping the cheapest price seen at each bound so the conversion can never raise a live price.
CREATE TABLE "CargoTariff_new" (
  "id"            TEXT NOT NULL,
  "minWeightKg"   DECIMAL(6,2) NOT NULL,
  "pricePerKgRub" DECIMAL(10,2) NOT NULL,
  "pickupFeeRub"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"   TEXT NOT NULL,
  CONSTRAINT "CargoTariff_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CargoTariff_new" ("id", "minWeightKg", "pricePerKgRub", "pickupFeeRub", "isActive", "createdAt", "createdById")
SELECT DISTINCT ON ("minWeightKg")
  "id", "minWeightKg", "pricePerKgRub", "pickupFeeRub", "isActive", "createdAt", "createdById"
FROM "CargoTariff"
WHERE "isActive" = true
ORDER BY "minWeightKg", "pricePerKgRub" ASC, "createdAt" DESC;

-- Shipment.tariffId points at the old table; repoint it before the old table goes away. Rows whose
-- bracket lost the DISTINCT ON above keep a real bracket at the same weight bound rather than a
-- dangling id -- the snapshot columns, not this FK, are what the customer was actually charged.
ALTER TABLE "Shipment" DROP CONSTRAINT IF EXISTS "Shipment_tariffId_fkey";
UPDATE "Shipment" s
SET "tariffId" = n."id"
FROM "CargoTariff" o
JOIN "CargoTariff_new" n ON n."minWeightKg" = o."minWeightKg"
WHERE s."tariffId" = o."id" AND s."tariffId" <> n."id";

ALTER TABLE "CargoTariff" DROP CONSTRAINT IF EXISTS "CargoTariff_routeId_fkey";
ALTER TABLE "CargoTariff" DROP CONSTRAINT IF EXISTS "CargoTariff_createdById_fkey";
DROP TABLE "CargoTariff";
ALTER TABLE "CargoTariff_new" RENAME TO "CargoTariff";
ALTER TABLE "CargoTariff" RENAME CONSTRAINT "CargoTariff_new_pkey" TO "CargoTariff_pkey";
CREATE INDEX "CargoTariff_isActive_minWeightKg_idx" ON "CargoTariff"("isActive", "minWeightKg");
ALTER TABLE "CargoTariff" ADD CONSTRAINT "CargoTariff_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shipment: cities and item type in, route and free-text description out.
ALTER TABLE "Shipment"
  ADD COLUMN "originCityId"            TEXT,
  ADD COLUMN "destinationCityId"       TEXT,
  ADD COLUMN "itemTypeId"              TEXT,
  ADD COLUMN "quantity"                INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "pricePerItemRubSnapshot" DECIMAL(10,2);

-- Carry existing shipments over by matching their route's city names against the seeded lists;
-- anything unmatched (a route named in another language) falls back to the first city of that
-- role, which is visibly wrong in admin rather than silently null.
UPDATE "Shipment" s
SET "originCityId" = COALESCE(
      (SELECT c."id" FROM "CargoCity" c
        WHERE c."role" = 'ORIGIN' AND lower(c."name") = lower(r."originCity") LIMIT 1),
      (SELECT c."id" FROM "CargoCity" c WHERE c."role" = 'ORIGIN' ORDER BY c."sortOrder" LIMIT 1)),
    "destinationCityId" = COALESCE(
      (SELECT c."id" FROM "CargoCity" c
        WHERE c."role" = 'DESTINATION' AND lower(c."name") = lower(r."destinationCity") LIMIT 1),
      (SELECT c."id" FROM "CargoCity" c WHERE c."role" = 'DESTINATION' ORDER BY c."sortOrder" LIMIT 1))
FROM "CargoRoute" r
WHERE r."id" = s."routeId";

-- Every pre-v2 shipment was weight-priced; that is the only thing the old model could express.
UPDATE "Shipment" SET "itemTypeId" = 'cargo_item_personal' WHERE "itemTypeId" IS NULL;

ALTER TABLE "Shipment"
  ALTER COLUMN "originCityId" SET NOT NULL,
  ALTER COLUMN "destinationCityId" SET NOT NULL,
  ALTER COLUMN "itemTypeId" SET NOT NULL,
  ALTER COLUMN "tariffId" DROP NOT NULL,
  ALTER COLUMN "declaredWeightKg" DROP NOT NULL,
  ALTER COLUMN "pricePerKgRubSnapshot" DROP NOT NULL;

DROP INDEX IF EXISTS "Shipment_routeId_idx";
ALTER TABLE "Shipment" DROP CONSTRAINT IF EXISTS "Shipment_routeId_fkey";
ALTER TABLE "Shipment"
  DROP COLUMN "routeId",
  DROP COLUMN "cargoDescription",
  DROP COLUMN "declaredValueTmt";

DROP TABLE "CargoRoute";

CREATE INDEX "Shipment_originCityId_idx"      ON "Shipment"("originCityId");
CREATE INDEX "Shipment_destinationCityId_idx" ON "Shipment"("destinationCityId");
CREATE INDEX "Shipment_itemTypeId_idx"        ON "Shipment"("itemTypeId");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originCityId_fkey"
  FOREIGN KEY ("originCityId") REFERENCES "CargoCity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_destinationCityId_fkey"
  FOREIGN KEY ("destinationCityId") REFERENCES "CargoCity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_itemTypeId_fkey"
  FOREIGN KEY ("itemTypeId") REFERENCES "CargoItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tariffId_fkey"
  FOREIGN KEY ("tariffId") REFERENCES "CargoTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
