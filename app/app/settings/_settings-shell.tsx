"use client";

/**
 * app/app/settings/_settings-shell.tsx
 * Settings shell — desktop sidebar nav + mobile drill-down (D-11, UX-01).
 *
 * Desktop (md+):
 *   Left sidebar (240px) with section nav buttons.
 *   Right content panel (flex-1, max-w 720) — shows the active section.
 *   Matches surface-settings.jsx design: sidebar + content side-by-side.
 *
 * Mobile (<md):
 *   Section nav list first. Tapping a section pushes a full-screen
 *   view of that section with a ← Back affordance.
 *
 * All section content (edit, save, toggle) is fully functional at 375px —
 * no read-only stripping (D-11, UX-01 constraint).
 *
 * WCAG 2.1 AA:
 *   - Back button has aria-label="Back to settings"
 *   - Section nav items have role="button" + aria-label
 *   - Focus moves to section heading on open; back to nav item on back (D-11)
 *   - Active nav item has aria-current="page"
 */

import { useState, useRef, useCallback, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Icons, type IconName } from "@/components/design/icons";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SettingsSection {
  id: string;
  label: string;
  icon: IconName;
  description: string;
  content: ReactNode;
}

interface SettingsShellProps {
  sections: SettingsSection[];
}

// ─── SettingsShell ─────────────────────────────────────────────────────────────

/**
 * SettingsShell — handles desktop sidebar + mobile section drill-down.
 *
 * Desktop: sidebar nav with section buttons + content panel side-by-side.
 * Mobile: shows section nav; tapping a section pushes the full-screen content.
 */
export function SettingsShell({ sections }: SettingsShellProps) {
  // Desktop: which section is active in the sidebar
  const [activeDesktopId, setActiveDesktopId] = useState<string>(sections[0]?.id ?? "");

  // Mobile: which section is drilled into (null = nav list)
  const [activeMobileId, setActiveMobileId] = useState<string | null>(null);

  // Ref to the last activated mobile nav row — for returning focus on Back (D-11)
  const lastActivatedNavRef = useRef<HTMLButtonElement | null>(null);
  // Ref to the section heading — for moving focus on open (D-11)
  const sectionHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const handleMobileSectionActivate = useCallback((id: string, el: HTMLButtonElement | null) => {
    lastActivatedNavRef.current = el;
    setActiveMobileId(id);
    requestAnimationFrame(() => {
      sectionHeadingRef.current?.focus();
    });
  }, []);

  const handleMobileBack = useCallback(() => {
    setActiveMobileId(null);
    requestAnimationFrame(() => {
      lastActivatedNavRef.current?.focus();
    });
  }, []);

  const activeMobileSection = sections.find((s) => s.id === activeMobileId) ?? null;
  const activeDesktopSection = sections.find((s) => s.id === activeDesktopId) ?? sections[0];

  return (
    <>
      {/* ── Desktop layout: sidebar + content panel ───────────────────────── */}
      <div
        className="hidden md:flex"
        style={{ flex: 1, overflow: "hidden" }}
      >
        {/* Sidebar nav */}
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: "0.5px solid var(--border)",
            padding: "24px 16px",
            background: "var(--bg)",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {sections.map((s) => {
              const Ic = Icons[s.icon];
              const active = s.id === activeDesktopId;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveDesktopId(s.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={`Open ${s.label} settings`}
                  style={{
                    all: "unset",
                    padding: "9px 12px",
                    cursor: "pointer",
                    borderRadius: "var(--r-sm)",
                    background: active ? "var(--bg-subtle)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-secondary)",
                    fontWeight: active ? 500 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-subtle)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <Ic size={14} aria-hidden={true} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content panel */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "32px 48px 60px",
            background: "var(--bg)",
          }}
        >
          <div style={{ maxWidth: 720 }}>
            {activeDesktopSection?.content}
          </div>
        </div>
      </div>

      {/* ── Mobile layout: section nav → full-screen section ──────────────── */}
      <div className="md:hidden" style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Section nav list — visible when no section is active */}
        {!activeMobileId && (
          <nav
            aria-label="Settings sections"
            data-testid="settings-nav"
            className="overflow-hidden rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]"
          >
            {sections.map((section, i) => {
              const isLast = i === sections.length - 1;
              return (
                <SectionNavItem
                  key={section.id}
                  section={section}
                  isLast={isLast}
                  onActivate={handleMobileSectionActivate}
                />
              );
            })}
          </nav>
        )}

        {/* Section detail — visible when a section is active */}
        {activeMobileId && activeMobileSection && (
          <div>
            {/* Back affordance */}
            <div className="mb-4 flex items-center">
              <button
                onClick={handleMobileBack}
                aria-label="Back to settings"
                className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
            </div>

            {/* Section heading (receives focus on open) */}
            <h2
              ref={sectionHeadingRef}
              tabIndex={-1}
              className="mb-4 text-[22px] font-semibold tracking-[-0.01em] text-[var(--text)] focus:outline-none"
            >
              {activeMobileSection.label}
            </h2>

            {/* Section content — fully functional on mobile */}
            {activeMobileSection.content}
          </div>
        )}
      </div>
    </>
  );
}

// ─── SectionNavItem ────────────────────────────────────────────────────────────

function SectionNavItem({
  section,
  isLast,
  onActivate,
}: {
  section: SettingsSection;
  isLast: boolean;
  onActivate: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={btnRef}
      onClick={() => onActivate(section.id, btnRef.current)}
      aria-label={`Open ${section.label} settings`}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-5 py-4 text-left",
        "transition-colors duration-[120ms] hover:bg-[var(--bg-subtle)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acc-workflow)]",
        !isLast && "border-b border-[var(--border)]"
      )}
      data-testid={`settings-nav-${section.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[var(--text)]">{section.label}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-tertiary)]">
          {section.description}
        </div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
    </button>
  );
}
