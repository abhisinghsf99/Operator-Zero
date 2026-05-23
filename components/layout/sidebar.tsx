"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icons, type IconName } from "@/components/design/icons";
import { Avatar } from "@/components/design/primitives";
import { ApprovalsBadgeSync } from "@/app/app/approvals/_realtime-sync";

type NavAccent = "chat" | "workflow" | "approval" | "activity" | "experiment";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  accent: NavAccent;
  ariaLabel: string;
};

// Primary nav — order matches the design (Workflows is the default landing surface).
const PRIMARY_NAV: NavItem[] = [
  {
    id: "workflows",
    label: "My Workflows",
    href: "/app/workflows",
    icon: "Workflows",
    accent: "workflow",
    ariaLabel: "My Workflows — view and manage your automated workflows",
  },
  {
    id: "chat",
    label: "Conversation",
    href: "/app/chat",
    icon: "Chat",
    accent: "chat",
    ariaLabel: "Conversation — chat with the Operator Zero agent",
  },
  {
    id: "approvals",
    label: "Approval Inbox",
    href: "/app/approvals",
    icon: "Inbox",
    accent: "approval",
    ariaLabel: "Approval Inbox — review pending agent actions",
  },
  {
    id: "activity",
    label: "Activity",
    href: "/app/activity",
    icon: "Activity",
    accent: "activity",
    ariaLabel: "Activity — view a log of all agent actions",
  },
];

// v2 surfaces — shown as "Coming soon" (out of scope for v1, per PROJECT.md).
const V2_NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "experiments", label: "Experiments", icon: "Experiment" },
  { id: "domains", label: "Domains", icon: "Domains" },
];

const ACTIVE_BG: Record<NavAccent, string> = {
  chat: "bg-[var(--acc-chat-bg)] text-[var(--acc-chat-ink)]",
  workflow: "bg-[var(--acc-workflow-bg)] text-[var(--acc-workflow-ink)]",
  approval: "bg-[var(--acc-approval-bg)] text-[var(--acc-approval-ink)]",
  activity: "bg-[var(--acc-activity-bg)] text-[var(--acc-activity-ink)]",
  experiment: "bg-[var(--acc-experiment-bg)] text-[var(--acc-experiment-ink)]",
};

function NavLink({
  item,
  isActive,
  pendingCount,
  userId,
}: {
  item: NavItem;
  isActive: boolean;
  pendingCount?: number;
  userId?: string;
}) {
  const Icon = Icons[item.icon];
  const showBadge =
    item.id === "approvals" &&
    pendingCount !== undefined &&
    pendingCount > 0 &&
    !!userId;

  return (
    <Link
      href={item.href}
      aria-label={
        showBadge ? `${item.ariaLabel} (${pendingCount} pending)` : item.ariaLabel
      }
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-[10px] px-[10px] py-2 rounded-[var(--r-sm)]",
        "text-[13.5px] leading-none transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
        isActive
          ? cn(ACTIVE_BG[item.accent], "font-medium")
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-deeper)] hover:text-[var(--text)]",
        "motion-reduce:transition-none"
      )}
    >
      <Icon size={15} strokeWidth={isActive ? 1.7 : 1.5} />
      <span className="flex-1 truncate">{item.label}</span>
      {showBadge && userId && (
        <ApprovalsBadgeSync userId={userId} initialCount={pendingCount} />
      )}
    </Link>
  );
}

interface SidebarProps {
  /** Pending approvals count for the badge (APRV-05). Fetched server-side by layout. */
  pendingApprovalsCount?: number;
  /** Authenticated user ID — required for Realtime badge sync. */
  userId?: string;
  /** Store display name (from connected Shopify store / profile). */
  storeName?: string;
  /** Founder display name (account card). */
  founderName?: string;
  /** Store domain (account card). */
  storeDomain?: string;
}

export function Sidebar({
  pendingApprovalsCount,
  userId,
  storeName = "Your store",
  founderName = "Your account",
  storeDomain = "",
}: SidebarProps) {
  const pathname = usePathname();
  const isSettings = pathname === "/app/settings" || pathname.startsWith("/app/settings/");

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "hidden md:flex",
        "w-[248px] shrink-0 flex-col",
        "bg-[var(--bg-subtle)] border-r-[0.5px] border-[var(--border)]",
        "px-[14px] py-5 gap-1"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-[10px] px-2 pb-[18px]">
        <div
          className="w-7 h-7 rounded-full grid place-items-center bg-[var(--text)] text-[var(--bg)] shrink-0"
          aria-hidden="true"
        >
          <Icons.Logo size={16} strokeWidth={1.4} />
        </div>
        <div className="flex flex-col leading-[1.1] min-w-0">
          <span className="display text-[18px] text-[var(--text)] truncate">
            Operator Zero
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)] truncate">
            {storeName}
          </span>
        </div>
      </div>

      {/* Primary nav */}
      <nav aria-label="Primary navigation" className="flex flex-col gap-[1px]">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
            pendingCount={item.id === "approvals" ? pendingApprovalsCount : undefined}
            userId={userId}
          />
        ))}
      </nav>

      {/* Coming soon (v2) */}
      <div className="mt-[18px] mb-[6px] px-[10px] flex items-center gap-[6px]">
        <span className="text-[10.5px] text-[var(--text-faint)] uppercase tracking-[0.06em] font-medium">
          Coming soon
        </span>
        <span className="flex-1 h-[0.5px] bg-[var(--border)]" />
      </div>
      <nav aria-label="Upcoming surfaces" className="flex flex-col gap-[1px]">
        {V2_NAV.map((item) => {
          const Icon = Icons[item.icon];
          return (
            <div
              key={item.id}
              aria-disabled="true"
              title={`${item.label} — coming in v2`}
              className={cn(
                "relative flex items-center gap-[10px] px-[10px] py-2 rounded-[var(--r-sm)]",
                "text-[13.5px] leading-none text-[var(--text-tertiary)] cursor-default select-none"
              )}
            >
              <Icon size={15} strokeWidth={1.5} />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-faint)] tracking-[0.04em]">
                v2
              </span>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex flex-col gap-[1px]">
        <Link
          href="/app/settings"
          aria-label="Settings — manage connections and preferences"
          aria-current={isSettings ? "page" : undefined}
          className={cn(
            "relative flex items-center gap-[10px] px-[10px] py-2 rounded-[var(--r-sm)]",
            "text-[13.5px] leading-none transition-colors duration-[120ms]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1",
            isSettings
              ? cn(ACTIVE_BG.activity, "font-medium")
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-deeper)] hover:text-[var(--text)]",
            "motion-reduce:transition-none"
          )}
        >
          <Icons.Settings size={15} strokeWidth={isSettings ? 1.7 : 1.5} />
          <span className="flex-1 truncate">Settings</span>
        </Link>

        <Link
          href="/app/settings"
          aria-label="Account and store settings"
          className={cn(
            "mt-3 flex items-center gap-[10px] px-[10px] py-[10px] rounded-[var(--r-sm)]",
            "border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          )}
        >
          <Avatar size={28} name={founderName} />
          <div className="flex flex-col leading-[1.2] min-w-0">
            <span className="text-[12.5px] text-[var(--text)] font-medium truncate">
              {founderName}
            </span>
            {storeDomain && (
              <span className="text-[11px] text-[var(--text-tertiary)] truncate">
                {storeDomain}
              </span>
            )}
          </div>
        </Link>
      </div>
    </aside>
  );
}
