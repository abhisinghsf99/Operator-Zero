import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-pill)] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)]",
  {
    variants: {
      variant: {
        workflow:
          "bg-[var(--acc-workflow-bg)] text-[var(--acc-workflow-ink)] border-[0.5px] border-[color-mix(in_oklch,var(--acc-workflow-ink)_18%,transparent)]",
        chat:
          "bg-[var(--acc-chat-bg)] text-[var(--acc-chat-ink)] border-[0.5px] border-[color-mix(in_oklch,var(--acc-chat-ink)_18%,transparent)]",
        approval:
          "bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)] border-[0.5px] border-[color-mix(in_oklch,var(--acc-approval-ink)_18%,transparent)]",
        activity:
          "bg-[var(--acc-activity-bg)] text-[var(--acc-activity-ink)] border-[0.5px] border-[color-mix(in_oklch,var(--acc-activity-ink)_18%,transparent)]",
        success:
          "bg-[var(--bg-subtle)] text-[var(--success)] border-[0.5px] border-[color-mix(in_oklch,var(--success)_18%,transparent)]",
        warning:
          "bg-[var(--bg-subtle)] text-[var(--warning)] border-[0.5px] border-[color-mix(in_oklch,var(--warning)_18%,transparent)]",
        danger:
          "bg-[var(--bg-subtle)] text-[var(--danger)] border-[0.5px] border-[color-mix(in_oklch,var(--danger)_18%,transparent)]",
        subtle:
          "bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[0.5px] border-[var(--border)]",
      },
      size: {
        sm: "h-[18px] px-1.5 text-[11px]",
        md: "h-[22px] px-2 text-[11.5px]",
      },
    },
    defaultVariants: {
      variant: "subtle",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
