"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  GitBranch,
  Inbox,
  Activity,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "chat",
    label: "Chat",
    href: "/app/chat",
    icon: MessageSquare,
    accent: "chat",
    ariaLabel: "Conversation — chat with the agent",
  },
  {
    id: "workflows",
    label: "Workflows",
    href: "/app/workflows",
    icon: GitBranch,
    accent: "workflow",
    ariaLabel: "My Workflows",
  },
  {
    id: "approvals",
    label: "Approvals",
    href: "/app/approvals",
    icon: Inbox,
    accent: "approval",
    ariaLabel: "Approval Inbox",
  },
  {
    id: "activity",
    label: "Activity",
    href: "/app/activity",
    icon: Activity,
    accent: "activity",
    ariaLabel: "Activity log",
  },
  {
    id: "settings",
    label: "More",
    href: "/app/settings",
    icon: Settings,
    accent: "activity",
    ariaLabel: "Settings and more",
  },
] as const;

type TabAccent = "chat" | "workflow" | "approval" | "activity";

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      role="navigation"
      className={cn(
        "flex md:hidden",
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-[var(--bg-elevated)] border-t-[0.5px] border-[var(--border)]",
        "px-2 pb-[env(safe-area-inset-bottom,0px)]",
        "shadow-[var(--shadow-md)]"
      )}
    >
      {TABS.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        const accent = tab.accent as TabAccent;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-label={tab.ariaLabel}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1",
              "min-h-[56px] py-2 px-1",
              "text-[10.5px] font-medium leading-none",
              "transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acc-workflow)]",
              "motion-reduce:transition-none",
              // Default state
              !isActive && "text-[var(--text-tertiary)]",
              // Active per accent
              isActive && accent === "chat" && "text-[var(--acc-chat-ink)]",
              isActive && accent === "workflow" && "text-[var(--acc-workflow-ink)]",
              isActive && accent === "approval" && "text-[var(--acc-approval-ink)]",
              isActive && accent === "activity" && "text-[var(--acc-activity-ink)]"
            )}
          >
            <tab.icon
              aria-hidden="true"
              size={20}
              strokeWidth={isActive ? 1.9 : 1.5}
              className="shrink-0"
            />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
