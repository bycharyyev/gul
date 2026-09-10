import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl2 text-sm font-semibold transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-gradient-brand text-white shadow-soft hover:brightness-110 active:brightness-95",
        secondary:
          "bg-white text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 dark:bg-surface-dark dark:text-brand-200 dark:ring-brand-800",
        ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
        accent: "bg-gradient-brand text-white hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-5",
        lg: "h-13 px-7 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
