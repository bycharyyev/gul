# Cargo — Assumptions (v1)

Per the master prompt's own §90-91 rule: don't invent business rules silently. Everything here is
either a real answer given during scoping, or a documented gap the code works around honestly
rather than pretending is solved. Nothing below is a guess dressed up as configuration.

## Known (confirmed during scoping)

- Warehouse in the origin country is the **partner's** facility — Gulyaly does not run a
  scan/weigh/accept workflow. Modeled by *not* building one, not by a placeholder.
- Pickup at the sender's address is required from **day one**.
- Tariff is a **weight-bracket rate per kg, priced in RUB** — no volumetric weight. *(Corrected
  2026-09-04: originally scoped as a flat TMT rate; the real figures turned out to be brackets —
  140 RUB/kg under 50kg, 130 from 50kg, 120 from 100kg on the Moscow→Ashgabat route, converted to
  TMT via independent USD cross-rates rather than a direct RUB→TMT rate. Production held zero
  Cargo rows at the time, so this was a schema/service rework, not a data migration.)*
- v1 launches with **one route**.

## Configurable (admin-editable, not hardcoded, but v1 ships with real values for one route)

- Route (origin/destination) — `CargoRoute`, admin-managed, currently one row.
- Weight brackets (min weight, price per kg, pickup fee, all in RUB) — `CargoTariff`, admin-managed
  as a full-replace set per route (`setTariffBrackets`), versioned so a rate change never rewrites
  an existing shipment's price.
- USD cross-rates (RUB/USD, TMT/USD) — `CargoExchangeRate`, a singleton row admin edits from the
  Cargo page's Exchange Rate card. Both rates are stored independently (not one derived RUB→TMT
  number) because RUB and TMT float against USD separately and a single derived number would go
  silently stale the moment only one of them moved.

## Assumed, not confirmed — flagged, not silently decided

- **Pickup coordination is manual.** No carrier/partner API integration exists or was described.
  A `CargoPickupRequest` captures the customer's ask; an admin coordinates the actual pickup with
  the partner out-of-band (phone/Telegram, this project's real channel per the audit) and updates
  the status by hand. If the partner later offers an API, this is the integration point — nothing
  else in the schema needs to change for that.
- **Payment confirmation is manual**, following `GalleryOrder`'s real precedent rather than
  `PaymentProviderRegistry` (see `ARCHITECTURE.md` §1 for why those two precedents disagree and
  which one this follows). Not wired to any real payment gateway.
- **Pickup time window is free text** (e.g. "10:00-14:00"), not a structured slot system. There's
  no capacity/slot data to validate a structured window against yet.
- **Refund policy on `PAID -> CANCELLED` is undefined.** The status transition is allowed; what
  happens to the customer's money is not specified anywhere and needs a real decision before this
  path is exercised for a real cancellation, not just a documented status change.
- **Tracking numbers use a generic `CRG-` prefix**, not a destination-derived one (the prompt's own
  example used `ASH-...` for Ashgabat). Deliberate: city names may arrive in Cyrillic or Latin
  script, and a second route later shouldn't need a prefix-derivation scheme decided under time
  pressure. Worth revisiting once there's more than one route.

## Explicitly not modeled (see ARCHITECTURE.md §8 Non-Goals for the full list and reasoning)

Customs handling, insurance terms, compliance posture for international shipping, expected volume,
and target margin were not part of this scoping conversation and are not represented anywhere in
the code, docs, or defaults. Nothing here should be read as an implicit position on any of them.
