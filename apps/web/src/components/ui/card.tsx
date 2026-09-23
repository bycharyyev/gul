import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl2 border border-slate-200/70 bg-surface shadow-soft dark:border-white/10 dark:bg-surface-dark",
        className,
      )}
      {...props}
    />
  );
}
