/**
 * When `/api/partner/...` without a version stops being served.
 *
 * A date rather than "eventually", because a deprecation with no end never moves anybody. It is
 * a promise to the integrators reading the `Sunset` header: it must not pass without either the
 * callers having moved or this date having been pushed out deliberately.
 *
 * Six months from the day versioning landed. Long enough for somebody who checks their
 * integration quarterly to see the header twice before anything changes.
 */
export const PARTNER_UNVERSIONED_SUNSET = new Date("2027-03-10T00:00:00Z");
