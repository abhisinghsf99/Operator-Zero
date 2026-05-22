"use client";

/**
 * components/chat/reasoning-block.tsx
 * Collapsible reasoning chain — "Why?" expander for agent thought process.
 *
 * CONV-08: Reasoning chains are collapsed behind a "Why?" expander.
 * Collapsed by default with an accessible aria-expanded toggle.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - aria-expanded on the toggle button
 *   - aria-controls linking button to content panel
 *   - Keyboard-operable (button element, Enter/Space)
 *   - prefers-reduced-motion: disables height transition
 */

import { useState, useId } from "react";
import { cn } from "@/lib/utils";

interface ReasoningBlockProps {
  content: string;
  className?: string;
}

export function ReasoningBlock({ content, className }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  if (!content) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]",
        className
      )}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left",
          "text-xs font-medium text-[var(--text-secondary)]",
          "hover:text-[var(--text)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-chat-ink)]",
          "transition-colors rounded-lg"
        )}
      >
        {/* Chevron icon */}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            "h-3 w-3 flex-shrink-0 transition-transform motion-reduce:transition-none",
            isExpanded ? "rotate-90" : "rotate-0"
          )}
          aria-hidden="true"
        >
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Why?
        {!isExpanded && (
          <span className="text-[var(--text-tertiary)]">(click to expand reasoning)</span>
        )}
      </button>

      {/* Collapsible content */}
      <div
        id={contentId}
        role="region"
        aria-label="Agent reasoning"
        hidden={!isExpanded}
        className={cn(
          "border-t border-[var(--border)] px-3 py-3",
          "text-xs leading-relaxed text-[var(--text-secondary)]",
          "whitespace-pre-wrap"
        )}
      >
        {content}
      </div>
    </div>
  );
}
