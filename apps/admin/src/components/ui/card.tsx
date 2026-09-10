import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl2 border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}
