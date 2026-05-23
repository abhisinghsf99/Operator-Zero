/**
 * components/design/icons.tsx
 * Line-icon set ported verbatim from the Operator Zero Design Files (icons.jsx).
 * Consistent 1.5px stroke, currentColor. Server-safe (pure SVG, no interactivity).
 */
import type { CSSProperties, ReactNode } from "react";

export type IconProps = {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
  "aria-hidden"?: boolean;
};

function Icon({
  children,
  size = 16,
  strokeWidth = 1.5,
  style,
  className,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Workflows: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="13" width="7" height="7" rx="1.5" />
      <rect x="14" y="13" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  Chat: (p: IconProps) => (
    <Icon {...p}>
      <path d="M21 12a8.5 8.5 0 1 1-3.4-6.78L21 4l-1 4.13A8.46 8.46 0 0 1 21 12Z" />
    </Icon>
  ),
  Inbox: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 6h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" />
    </Icon>
  ),
  Activity: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Icon>
  ),
  Settings: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Icon>
  ),
  Experiment: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 3v6L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3L15 9V3" />
      <path d="M8 3h8" />
      <path d="M7 14h10" />
    </Icon>
  ),
  Domains: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  ),
  Plus: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  ),
  Check: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 12l5 5L20 7" />
    </Icon>
  ),
  CheckDouble: (p: IconProps) => (
    <Icon {...p}>
      <path d="M2 13l4 4L14 9" />
      <path d="M9 17l4 4 9-12" />
    </Icon>
  ),
  X: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  ),
  ChevronRight: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  ),
  ChevronDown: (p: IconProps) => (
    <Icon {...p}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  ),
  ChevronUp: (p: IconProps) => (
    <Icon {...p}>
      <path d="M18 15l-6-6-6 6" />
    </Icon>
  ),
  ChevronLeft: (p: IconProps) => (
    <Icon {...p}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  ),
  More: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  ),
  Search: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Icon>
  ),
  Send: (p: IconProps) => (
    <Icon {...p}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </Icon>
  ),
  Pause: (p: IconProps) => (
    <Icon {...p}>
      <rect x="6" y="5" width="3.5" height="14" rx="1" />
      <rect x="14.5" y="5" width="3.5" height="14" rx="1" />
    </Icon>
  ),
  Play: (p: IconProps) => (
    <Icon {...p}>
      <path d="M7 4l13 8-13 8z" />
    </Icon>
  ),
  Edit: (p: IconProps) => (
    <Icon {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4Z" />
    </Icon>
  ),
  Trash: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </Icon>
  ),
  Clock: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Icon>
  ),
  Calendar: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </Icon>
  ),
  Bolt: (p: IconProps) => (
    <Icon {...p}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </Icon>
  ),
  Lock: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </Icon>
  ),
  Sparkles: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </Icon>
  ),
  Diamond: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 2L2 12l10 10 10-10z" />
    </Icon>
  ),
  Logo: (p: IconProps) => (
    <Icon strokeWidth={1.3} {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </Icon>
  ),
  Shopify: (p: IconProps) => (
    <Icon {...p}>
      <path d="M14.5 4.5c-1 0-1.5 1-1.8 2-.6-.3-1.2-.5-1.8-.5-2.5 0-4.5 3-4.5 6.5l-1 8.5h11l1-12c0-2.5-1-4.5-2.9-4.5z" />
      <path d="M14 4.5c.5 0 .9.3 1.2.8M11 9c0 1 .5 1.5 1.5 2 .8.4 1.5.9 1.5 1.8 0 1-1 1.7-2 1.7-.7 0-1.3-.2-1.8-.5" />
    </Icon>
  ),
  Gmail: (p: IconProps) => (
    <Icon {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 7l10 7 10-7" />
    </Icon>
  ),
  Meta: (p: IconProps) => (
    <Icon {...p}>
      <path d="M2 12c0-5 2.5-7 5.5-7 2.5 0 4 1.5 6.5 6 2.5 4.5 4 6 6 6 1.5 0 2-1 2-3" />
      <path d="M22 12c0-5-2.5-7-5.5-7-2.5 0-4 1.5-6.5 6-2.5 4.5-4 6-6 6-1.5 0-2-1-2-3" />
    </Icon>
  ),
  Brain: (p: IconProps) => (
    <Icon {...p}>
      <path d="M9 3a3 3 0 0 0-3 3v0a3 3 0 0 0-2 5v0a3 3 0 0 0 2 5v0a3 3 0 0 0 3 3h3V3H9z" />
      <path d="M15 3a3 3 0 0 1 3 3v0a3 3 0 0 1 2 5v0a3 3 0 0 1-2 5v0a3 3 0 0 1-3 3h-3V3h3z" />
    </Icon>
  ),
  Tag: (p: IconProps) => (
    <Icon {...p}>
      <path d="M20 12.4L12.4 20a2 2 0 0 1-2.8 0L3 13.4V3h10.4L20 9.6a2 2 0 0 1 0 2.8z" />
      <circle cx="8" cy="8" r="1.3" />
    </Icon>
  ),
  Box: (p: IconProps) => (
    <Icon {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </Icon>
  ),
  Search2: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Icon>
  ),
  Question: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2.5-2.5 3.5" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </Icon>
  ),
  Filter: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 4h18l-7 9v6l-4 2v-8z" />
    </Icon>
  ),
  Undo: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-6.7L3 9" />
    </Icon>
  ),
  Warning: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 3L2 20h20zM12 9v5" />
      <circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
    </Icon>
  ),
  ArrowRight: (p: IconProps) => (
    <Icon {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  ),
  ArrowUp: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  ),
  Dot: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Spark: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
    </Icon>
  ),
  Eye: (p: IconProps) => (
    <Icon {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  ),
  ArrowDownRight: (p: IconProps) => (
    <Icon {...p}>
      <path d="M7 7l10 10M17 17V8M17 17H8" />
    </Icon>
  ),
} as const;

export type IconName = keyof typeof Icons;
