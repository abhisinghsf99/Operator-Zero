"use client";

import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--bg-elevated)] group-[.toaster]:text-[var(--text)] group-[.toaster]:border-[0.5px] group-[.toaster]:border-[var(--border)] group-[.toaster]:shadow-[var(--shadow-md)] group-[.toaster]:rounded-[var(--r-lg)]",
          description:
            "group-[.toast]:text-[var(--text-secondary)] group-[.toast]:text-[12.5px]",
          actionButton:
            "group-[.toast]:bg-[var(--text)] group-[.toast]:text-[var(--bg)]",
          cancelButton:
            "group-[.toast]:bg-[var(--bg-subtle)] group-[.toast]:text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
