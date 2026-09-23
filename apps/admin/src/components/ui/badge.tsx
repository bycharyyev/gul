import type { HTMLAttributes } from "react";
import { useTranslation } from "@topup-hub/i18n";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700",
  PAID: "bg-sky-100 text-sky-700",
  PROCESSING: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  REFUNDED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-slate-200 text-slate-700",
  QUEUED: "bg-amber-100 text-amber-700",
  SENT: "bg-sky-100 text-sky-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  ADMIN: "bg-brand-100 text-brand-700",
  MANAGER: "bg-teal-100 text-teal-700",
  SUPPORT: "bg-slate-200 text-slate-700",
  // Cargo (Shipment) -- not in TRANSLATED_STATUSES below, so these render the raw enum value,
  // same fallback every other untranslated status already uses (TopupJobStatus, UserRole).
  DRAFT: "bg-slate-100 text-slate-600",
  QUOTE_CREATED: "bg-slate-100 text-slate-600",
  PICKUP_REQUESTED: "bg-amber-100 text-amber-700",
  PICKUP_CONFIRMED: "bg-amber-100 text-amber-700",
  PICKED_UP: "bg-sky-100 text-sky-700",
  IN_TRANSIT: "bg-sky-100 text-sky-700",
  ARRIVED_DESTINATION: "bg-sky-100 text-sky-700",
  READY_FOR_PICKUP: "bg-teal-100 text-teal-700",
  OUT_FOR_DELIVERY: "bg-teal-100 text-teal-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  EXCEPTION: "bg-rose-100 text-rose-700",
};

// Order-status enum values (OrderStatus ∪ GalleryOrderStatus) that have a
// catalogued "orderStatus.<VALUE>" translation. Other values rendered through
// this badge (TopupJobStatus, UserRole) fall back to the raw status string,
// same as before this component was localized.
const TRANSLATED_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
  "DELIVERED",
]);

export function StatusBadge({
  status,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status: string }) {
  const { t } = useTranslation();
  const label = TRANSLATED_STATUSES.has(status) ? t(`orderStatus.${status}`) : status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusColors[status] ?? "bg-slate-100 text-slate-700",
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}
