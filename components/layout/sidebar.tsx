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

const NAV_ITEMS = [
  {
    id: "chat",
    label: "Conversation",
    href: "/app/chat",
    icon: MessageSquare,
    accent: "chat",
    ariaLabel: "Conversation — chat with the Operator Zero agent",
  },
  {
    id: "workflows",
    label: "My Workflows",
    href: "/app/workflows",
    icon: GitBranch,
    accent: "workflow",
    ariaLabel: "My Workflows — view and manage your automated workflows",
  },
  {
    id: "approvals",
    label: "Approval Inbox",
    href: "/app/approvals",
    icon: Inbox,
    accent: "approval",
    ariaLabel: "Approval Inbox — review pending agent actions",
  },
  {
    id: "activity",
    label: "Activity",
    href: "/app/activity",
    icon: Activity,
    accent: "activity",
    ariaLabel: "Activity — view a log of all agent actions",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/app/settings",
    icon: Settings,
    accent: "activity",
    ariaLabel: "Settings — manage connections and preferences",
  },
] as const;

type NavAccent = "chat" | "workflow" | "approval" | "activity";

function NavLink({
  item,
  isActive,
}: {
  item: (typeof NAV_ITEMS)[number];
  isActive: boolean;
}) {
  const accent = item.accent as NavAccent;

  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        // Base
        "flex items-center gap-[10px] px-[10px] py-2 rounded-[var(--r-sm)]",
        "text-[13.5px] leading-none transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
        // Default state
        "text-[var(--text-secondary)] hover:bg-[var(--bg-deeper)] hover:text-[var(--text)]",
        // Active state — per accent
        isActive && accent === "chat" &&
          "bg-[var(--acc-chat-bg)] text-[var(--acc-chat-ink)] font-medium hover:bg-[var(--acc-chat-bg)]",
        isActive && accent === "workflow" &&
          "bg-[var(--acc-workflow-bg)] text-[var(--acc-workflow-ink)] font-medium hover:bg-[var(--acc-workflow-bg)]",
        isActive && accent === "approval" &&
          "bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)] font-medium hover:bg-[var(--acc-approval-bg)]",
        isActive && accent === "activity" &&
          "bg-[var(--acc-activity-bg)] text-[var(--acc-activity-ink)] font-medium hover:bg-[var(--acc-activity-bg)]",
        // Reduced motion
        "motion-reduce:transition-none"
      )}
    >
      <item.icon
        aria-hidden="true"
        size={15}
        strokeWidth={isActive ? 1.7 : 1.5}
        className="shrink-0"
      />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "hidden md:flex",
        "w-[248px] shrink-0 flex-col",
        "bg-[var(--bg-subtle)] border-r border-r-[0.5px] border-[var(--border)]",
        "px-[14px] py-5 gap-1"
      )}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-[10px] px-2 pb-[18px]">
        <div
          className="w-7 h-7 rounded-full grid place-items-center bg-[var(--text)] text-[var(--bg)] shrink-0"
          aria-hidden="true"
        >
          <span className="text-[11px] font-bold leading-none select-none">0Z</span>
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span
            className="display text-[18px] text-[var(--text)] truncate"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Operator Zero
          </span>
        </div>
      </div>

      {/* Primary nav */}
      <nav aria-label="Primary navigation" className="flex flex-col gap-[1px]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>
    </aside>
  );
}
