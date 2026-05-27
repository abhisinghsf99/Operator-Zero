"use client";

/**
 * components/design/primitives.tsx
 * Shared UI primitives ported from Operator Zero Design Files (components.jsx).
 * Token-driven inline styles for pixel fidelity with the design prototypes.
 *
 * These are presentational. Wire data/handlers from the surfaces that use them.
 */
import type { CSSProperties, ReactNode } from "react";
import { Icons, type IconName } from "@/components/design/icons";

type Accent = "workflow" | "chat" | "approval" | "experiment" | "activity";

/* ─────────── Button ─────────── */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  accent,
  onClick,
  type = "button",
  disabled,
  style,
  title,
  "aria-label": ariaLabel,
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  accent?: Accent;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
  "aria-label"?: string;
}) {
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: accent ? `var(--acc-${accent}-ink)` : "var(--text)",
      color: "var(--bg)",
      border: "0.5px solid transparent",
    },
    secondary: {
      background: "var(--bg-elevated)",
      color: "var(--text)",
      border: "0.5px solid var(--border-strong)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)",
      border: "0.5px solid transparent",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "0.5px solid var(--border)",
    },
    accent: {
      background: `var(--acc-${accent || "workflow"}-bg)`,
      color: `var(--acc-${accent || "workflow"}-ink)`,
      border: `0.5px solid color-mix(in oklch, var(--acc-${accent || "workflow"}-ink) 25%, transparent)`,
    },
  };
  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { height: 28, padding: "0 10px", fontSize: 12.5, borderRadius: "var(--r-sm)", gap: 6 },
    md: { height: 34, padding: "0 14px", fontSize: 13, borderRadius: "var(--r-sm)", gap: 8 },
    lg: { height: 40, padding: "0 18px", fontSize: 14, borderRadius: "var(--r-md)", gap: 8 },
  };
  const Ico = icon ? Icons[icon] : null;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        ...variants[variant],
        ...sizes[size],
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
        fontWeight: 500,
        letterSpacing: "-0.005em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s, border 0.12s, color 0.12s, transform 0.06s",
        ...style,
      }}
    >
      {Ico && <Ico size={size === "sm" ? 13 : 14} />}
      {children}
    </button>
  );
}

/* ─────────── IconButton ─────────── */
export function IconButton({
  icon,
  onClick,
  title,
  size = 32,
  accent,
  active,
  "aria-label": ariaLabel,
  "aria-haspopup": ariaHasPopup,
  "aria-expanded": ariaExpanded,
}: {
  icon: IconName;
  onClick?: () => void;
  title?: string;
  size?: number;
  accent?: Accent;
  active?: boolean;
  "aria-label"?: string;
  "aria-haspopup"?: boolean | "menu" | "dialog" | "listbox" | "tree" | "grid" | "false" | "true";
  "aria-expanded"?: boolean;
}) {
  const Ico = Icons[icon];
  // When the button acts as a popup trigger (aria-haspopup set), it must NOT
  // also announce as a toggle button — expose menu-button semantics instead of
  // aria-pressed so screen readers describe it as a menu button (WCAG 2.1 AA).
  const isPopupTrigger = ariaHasPopup != null;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={isPopupTrigger ? undefined : active}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        background: active ? `var(--acc-${accent || "activity"}-bg)` : "transparent",
        color: active ? `var(--acc-${accent || "activity"}-ink)` : "var(--text-secondary)",
        border: "0.5px solid transparent",
        borderRadius: "var(--r-sm)",
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {Ico && <Ico size={Math.round(size * 0.5)} />}
    </button>
  );
}

/* ─────────── Badge ─────────── */
export function Badge({
  children,
  accent = "activity",
  soft,
  mono,
  size = "md",
  style,
}: {
  children: ReactNode;
  accent?: Accent;
  soft?: boolean;
  mono?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
}) {
  const sizes = {
    sm: { height: 18, padding: "0 6px", fontSize: 11 },
    md: { height: 22, padding: "0 8px", fontSize: 11.5 },
  } as const;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        ...sizes[size],
        background: soft ? `var(--acc-${accent}-bg)` : "var(--bg-subtle)",
        color: `var(--acc-${accent}-ink)`,
        borderRadius: "var(--r-pill)",
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        fontWeight: 500,
        letterSpacing: mono ? "0.01em" : "-0.005em",
        whiteSpace: "nowrap",
        border: `0.5px solid color-mix(in oklch, var(--acc-${accent}-ink) 18%, transparent)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ─────────── Avatar ─────────── */
export function Avatar({
  name = "Sarah Mendez",
  size = 28,
  agent,
}: {
  name?: string;
  size?: number;
  agent?: boolean;
}) {
  const initials = agent
    ? null
    : name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: agent ? "var(--acc-chat-bg)" : "var(--bg-deeper)",
        color: agent ? "var(--acc-chat-ink)" : "var(--text)",
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: "0.02em",
        border: "0.5px solid var(--border)",
        fontFamily: "var(--font-sans)",
        flexShrink: 0,
      }}
    >
      {agent ? <Icons.Logo size={size * 0.5} strokeWidth={1.6} /> : initials}
    </div>
  );
}

/* ─────────── LevelToggle ─────────── */
export type Level = "L1" | "L2" | "L3";
export function LevelToggle({
  value,
  onChange,
  size = "md",
}: {
  value: Level;
  onChange?: (level: Level) => void;
  size?: "sm" | "md";
}) {
  const levels: { key: Level; label: string; title: string }[] = [
    { key: "L1", label: "L1", title: "Manual — agent prepares, you trigger" },
    { key: "L2", label: "L2", title: "Approval-gated — agent proposes, you approve" },
    { key: "L3", label: "L3", title: "Autonomous — agent acts, you observe" },
  ];
  return (
    <div
      role="radiogroup"
      style={{
        display: "inline-flex",
        padding: 2,
        background: "var(--bg-subtle)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-sm)",
        gap: 1,
      }}
    >
      {levels.map((l) => {
        const active = value === l.key;
        return (
          <button
            key={l.key}
            role="radio"
            aria-checked={active}
            title={l.title}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(l.key);
            }}
            style={{
              padding: size === "sm" ? "2px 8px" : "3px 10px",
              fontSize: size === "sm" ? 11 : 12,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text)" : "var(--text-tertiary)",
              border: "0.5px solid",
              borderColor: active ? "var(--border-strong)" : "transparent",
              borderRadius: "var(--r-xs)",
              cursor: "pointer",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "all 0.12s",
            }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────── StatusDot ─────────── */
export function StatusDot({ status, size = 7 }: { status: string; size?: number }) {
  const map: Record<string, string> = {
    active: "var(--success)",
    success: "var(--success)",
    paused: "var(--text-faint)",
    draft: "var(--text-faint)",
    error: "var(--danger)",
    failed: "var(--danger)",
    partial: "var(--warning)",
    running: "var(--acc-workflow)",
  };
  const pulse = status === "running" || status === "active";
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: map[status] || "var(--text-faint)",
        flexShrink: 0,
        animation: pulse ? "glow 2.4s ease-in-out infinite" : "none",
      }}
    />
  );
}

/* ─────────── StakesIndicator ─────────── */
export function StakesIndicator({ level }: { level: "low" | "medium" | "high" }) {
  const map = {
    low: { label: "low", color: "var(--text-tertiary)", bars: 1 },
    medium: { label: "med", color: "var(--warning)", bars: 2 },
    high: { label: "high", color: "var(--danger)", bars: 3 },
  } as const;
  const s = map[level];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12 }}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 4 + i * 2,
              borderRadius: 1,
              background: i <= s.bars ? s.color : "var(--bg-deeper)",
            }}
          />
        ))}
      </span>
      <span style={{ fontSize: 11.5, color: s.color, fontWeight: 500, textTransform: "lowercase" }}>
        {s.label}
      </span>
    </span>
  );
}

/* ─────────── SurfaceHeader ─────────── */
export function SurfaceHeader({
  kicker,
  title,
  subtitle,
  accent = "activity",
  right,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: Accent;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      style={{
        padding: "32px 40px 22px",
        borderBottom: "0.5px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {kicker && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: `var(--acc-${accent}-ink)` }} />
              <span
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: `var(--acc-${accent}-ink)`,
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {kicker}
              </span>
            </div>
          )}
          <h1
            className="display"
            style={{ fontSize: 38, margin: 0, color: "var(--text)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-tertiary)", maxWidth: 640, lineHeight: 1.45 }}>
              {subtitle}
            </p>
          )}
        </div>
        {right && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>}
      </div>
      {children}
    </header>
  );
}

/* ─────────── Card ─────────── */
export function Card({
  children,
  padding = 18,
  style,
  onClick,
}: {
  children: ReactNode;
  padding?: number | string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-elevated)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────── DomainBadge ─────────── */
export function DomainBadge({ domain }: { domain: string }) {
  const map: Record<string, { icon: IconName }> = {
    Catalog: { icon: "Box" },
    SEO: { icon: "Search2" },
    "Q&A": { icon: "Chat" },
    Inventory: { icon: "Tag" },
  };
  const m = map[domain] || { icon: "Dot" };
  const Ico = Icons[m.icon];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: "var(--text-tertiary)",
        padding: "1px 7px 1px 5px",
        background: "var(--bg-subtle)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-xs)",
        height: 20,
      }}
    >
      <Ico size={11} />
      {domain}
    </span>
  );
}

/* ─────────── ResultIndicator ─────────── */
export function ResultIndicator({ result }: { result: "success" | "partial" | "failed" }) {
  if (result === "success") return <Icons.Check size={14} style={{ color: "var(--success)" }} />;
  if (result === "partial") return <Icons.Warning size={14} style={{ color: "var(--warning)" }} />;
  if (result === "failed") return <Icons.X size={14} style={{ color: "var(--danger)" }} />;
  return null;
}

/* ─────────── Kbd ─────────── */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 4px",
        background: "var(--bg-subtle)",
        border: "0.5px solid var(--border-strong)",
        borderRadius: "var(--r-xs)",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </span>
  );
}

/* ─────────── SectionHeader ─────────── */
export function SectionHeader({
  children,
  right,
  style,
}: {
  children: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 10px", ...style }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

/* ─────────── EmptyState ─────────── */
export function EmptyState({
  icon = "Dot",
  title,
  body,
  cta,
}: {
  icon?: IconName;
  title: ReactNode;
  body?: ReactNode;
  cta?: ReactNode;
}) {
  const Ico = Icons[icon];
  return (
    <div style={{ padding: "60px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 48,
          height: 48,
          background: "var(--bg-subtle)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          display: "grid",
          placeItems: "center",
          color: "var(--text-tertiary)",
        }}
      >
        <Ico size={20} />
      </div>
      <div className="display" style={{ fontSize: 22, color: "var(--text)" }}>
        {title}
      </div>
      {body && <p style={{ margin: 0, color: "var(--text-tertiary)", maxWidth: 360, fontSize: 13.5, lineHeight: 1.55 }}>{body}</p>}
      {cta}
    </div>
  );
}
