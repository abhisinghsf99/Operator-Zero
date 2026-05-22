import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] text-[13px] font-medium leading-none transition-all duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--text)] text-[var(--bg)] border border-transparent hover:opacity-90 active:translate-y-px",
        secondary:
          "bg-[var(--bg-elevated)] text-[var(--text)] border-[0.5px] border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] active:translate-y-px",
        ghost:
          "bg-transparent text-[var(--text-secondary)] border-[0.5px] border-transparent hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] active:translate-y-px",
        danger:
          "bg-transparent text-[var(--danger)] border-[0.5px] border-[var(--border)] hover:bg-[var(--bg-subtle)] active:translate-y-px",
        workflow:
          "bg-[var(--acc-workflow-bg)] text-[var(--acc-workflow-ink)] border-[0.5px] border-[color-mix(in_oklch,var(--acc-workflow-ink)_25%,transparent)] hover:opacity-90 active:translate-y-px",
      },
      size: {
        sm: "h-7 px-[10px] text-[12.5px] rounded-[var(--r-sm)] gap-1.5",
        md: "h-[34px] px-[14px] text-[13px] rounded-[var(--r-sm)] gap-2",
        lg: "h-10 px-[18px] text-[14px] rounded-[var(--r-md)] gap-2",
        icon: "h-[34px] w-[34px] rounded-[var(--r-sm)]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
