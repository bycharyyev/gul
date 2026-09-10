"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { useTranslation } from "@topup-hub/i18n";

const stages = ["link", "review", "purchase", "warehouse", "delivery"] as const;

export function PurchaseRoute({ active = 0 }: { active?: number }) {
  const { t } = useTranslation();
  return (
    <ol aria-label="Маршрут заказа" className="grid grid-cols-5 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/5">
      {stages.map((stage, index) => (
        <li key={stage} className="relative px-1 py-3 text-center text-[10px] font-semibold sm:px-3 sm:text-xs">
          <span className={`mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full ${index <= active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-white/10"}`}>
            {index < active ? <Check size={13} weight="bold" /> : index + 1}
          </span>
          <span className={index <= active ? "text-slate-900 dark:text-white" : "text-slate-400"}>{t(`web.purchase.route.${stage}`)}</span>
          {index < stages.length - 1 && <span aria-hidden="true" className={`absolute left-[62%] top-6 h-px w-[76%] ${index < active ? "bg-brand-500" : "bg-slate-200 dark:bg-white/10"}`} />}
        </li>
      ))}
    </ol>
  );
}
