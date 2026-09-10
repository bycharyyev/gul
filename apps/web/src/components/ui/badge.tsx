"use client";

import type { HTMLAttributes } from "react";
import { useTranslation } from "@topup-hub/i18n";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PAID: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  PROCESSING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  REFUNDED: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  CANCELLED: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  DELIVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export function StatusBadge({
  status,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusColors[status] ?? "bg-slate-100 text-slate-700",
        className,
      )}
      {...props}
    >
      {t(`orderStatus.${status}`)}
    </span>
  );
}
