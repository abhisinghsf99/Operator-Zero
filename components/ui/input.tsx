import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-[var(--r-sm)] border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1 text-[13px] text-[var(--text)] shadow-[var(--shadow-sm)] transition-colors",
        "placeholder:text-[var(--text-faint)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:border-[var(--acc-workflow)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Input };
