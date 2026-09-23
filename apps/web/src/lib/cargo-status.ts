import type { ShipmentStatus } from "@topup-hub/types";

/** Falls back to the raw enum value for a status that somehow has no translation --
 *  same defensive pattern admin's StatusBadge uses. */
export function cargoStatusLabel(t: (key: string) => string, status: ShipmentStatus): string {
  const label = t(`web.cargo.status.${status}`);
  return label.startsWith("web.cargo.status.") ? status : label;
}
