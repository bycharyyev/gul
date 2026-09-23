"use client";

import type { ShipmentStatus } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { cargoStatusLabel } from "@/lib/cargo-status";
import { cn } from "@/lib/utils";

// Mirrors ui/badge.tsx's visual language, kept separate rather than extending it: that component
// looks up "orderStatus.<status>" specifically, and Shipment statuses live under their own
// "web.cargo.status.<status>" namespace.
const STATUS_COLORS: Partial<Record<ShipmentStatus, string>> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PAID: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PICKUP_REQUESTED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PICKUP_CONFIRMED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PICKED_UP: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  IN_TRANSIT: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  ARRIVED_DESTINATION: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  READY_FOR_PICKUP: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  OUT_FOR_DELIVERY: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  DELIVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  CANCELLED: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  ON_HOLD: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  EXCEPTION: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function StatusPill({ status, className }: { status: ShipmentStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
        className,
      )}
    >
      {cargoStatusLabel(t, status)}
    </span>
  );
}
