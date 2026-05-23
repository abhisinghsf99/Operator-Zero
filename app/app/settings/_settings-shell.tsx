"use client";

/**
 * app/app/settings/_settings-shell.tsx
 * Settings mobile drill-down shell (D-11, UX-01).
 *
 * Desktop (md+):  All sections rendered in a single scrollable column.
 * Mobile (<md):   Section nav list first. Tapping a section pushes a full-screen
 *                 view of that section with a ← Back affordance.
 *
 * All section content (edit, save, toggle) is fully functional at 375px —
 * no read-only stripping (D-11, UX-01 constraint).
 *
 * WCAG 2.1 AA:
 *   - Back button has aria-label="Back to settings"
 *   - Section nav items have role="button" + aria-label
 *   - Focus moves to section heading on open; back to nav item on back (D-11)
 */

import { useState, useRef, useCallback, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SettingsSection {
  id: string;
  label: string;
  description: string;
  content: ReactNode;
}

interface SettingsShellProps {
  sections: SettingsSection[];
}

// ─── SettingsShell ─────────────────────────────────────────────────────────────

/**
 * SettingsShell — handles mobile section drill-down.
 *
 * On desktop: renders all sections as a scrollable list.
 * On mobile: shows section nav; tapping a section pushes the full-screen content.
 */
export function SettingsShell({ sections }: SettingsShellProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Ref to the last activated nav row — for returning focus on Back (D-11)
  const lastActivatedNavRef = useRef<HTMLButtonElement | null>(null);
  // Ref to the section heading — for moving focus on open (D-11)
  const sectionHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const handleSectionActivate = useCallback((id: string, el: HTMLButtonElement | null) => {
    lastActivatedNavRef.current = el;
    setActiveSectionId(id);
    // Move focus to section heading after render
    requestAnimationFrame(() => {
      sectionHeadingRef.current?.focus();
    });
  }, []);

  const handleBack = useCallback(() => {
    setActiveSectionId(null);
    requestAnimationFrame(() => {
      lastActivatedNavRef.current?.focus();
    });
  }, []);

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;

  return (
    <>
      {/* ── Desktop layout: all sections in one scrollable column ──────────── */}
      <div className="hidden md:block">
        {sections.map((section) => (
          <div key={section.id} className="mt-8 first:mt-0">
            {section.content}
          </div>
        ))}
      </div>

      {/* ── Mobile layout: section nav → full-screen section ──────────────── */}
      <div className="md:hidden">
        {/* Section nav list — visible when no section is active */}
        {!activeSectionId && (
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
                  onActivate={handleSectionActivate}
                />
              );
            })}
          </nav>
        )}

        {/* Section detail — visible when a section is active */}
        {activeSectionId && activeSection && (
          <div>
            {/* Back affordance */}
            <div className="mb-4 flex items-center">
              <button
                onClick={handleBack}
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
              {activeSection.label}
            </h2>

            {/* Section content — fully functional on mobile */}
            {activeSection.content}
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
