"use client";

/**
 * components/chat/chat-search-bar.tsx
 * In-thread message search bar for the chat header.
 *
 * Renders a controlled search input row under the header when visible.
 * Filters messages by case-insensitive substring match at the MESSAGE LEVEL
 * (no sub-string highlighting inside markdown — the parent handles scroll + highlight).
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Input has aria-label="Search this conversation"
 *   - aria-live="polite" region announces match count
 *   - Close button has aria-label="Close search"
 *   - Enter = next match, Shift+Enter = prev match, Escape = close
 *   - Input is autofocused on mount
 *
 * No new npm dependency — pure React with design tokens.
 */

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { Icons } from "@/components/design/icons";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ChatSearchBarProps {
  messages: Array<{ id: string; content: string }>;
  onActiveMatchChange: (messageId: string | null) => void;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ChatSearchBar({ messages, onActiveMatchChange, onClose }: ChatSearchBarProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const announcerId = useId();

  // Compute matches when query changes
  const matches = query.trim()
    ? messages.filter((m) =>
        m.content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      )
    : [];

  // Notify parent of the current active match id
  useEffect(() => {
    if (matches.length === 0) {
      onActiveMatchChange(null);
      return;
    }
    const clamped = Math.min(activeIndex, matches.length - 1);
    onActiveMatchChange(matches[clamped]?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, matches.length, query]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Autofocus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── Navigation helpers ─────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // ─── Keyboard handling ──────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onActiveMatchChange(null);
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
  };

  // ─── Display values ─────────────────────────────────────────────────────────

  const displayIndex = matches.length > 0 ? Math.min(activeIndex, matches.length - 1) + 1 : 0;
  const countLabel =
    query.trim() === ""
      ? ""
      : matches.length === 0
      ? "No matches"
      : `${displayIndex} / ${matches.length}`;

  const announceText =
    query.trim() === ""
      ? ""
      : matches.length === 0
      ? "No matches found"
      : `${matches.length} match${matches.length === 1 ? "" : "es"}, showing ${displayIndex}`;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      role="search"
      aria-label="Search this conversation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 32px",
        background: "var(--bg-elevated)",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search this conversation"
        aria-controls={announcerId}
        placeholder="Search messages…"
        autoComplete="off"
        spellCheck={false}
        style={{
          flex: 1,
          background: "var(--bg)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-sm)",
          padding: "6px 10px",
          fontSize: 13,
          color: "var(--text)",
          outline: "none",
          fontFamily: "inherit",
          minWidth: 0,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--acc-chat-ink)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      />

      {/* Match count */}
      {query.trim() && (
        <span
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
            minWidth: 52,
            textAlign: "right",
          }}
          aria-hidden="true"
        >
          {countLabel}
        </span>
      )}

      {/* Previous match */}
      <button
        onClick={goPrev}
        disabled={matches.length === 0}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        style={{
          all: "unset",
          cursor: matches.length === 0 ? "not-allowed" : "pointer",
          opacity: matches.length === 0 ? 0.35 : 1,
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--r-sm)",
          color: "var(--text-secondary)",
        }}
        onMouseEnter={(e) => { if (matches.length > 0) e.currentTarget.style.background = "var(--bg-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
      >
        <Icons.ChevronUp size={14} aria-hidden />
      </button>

      {/* Next match */}
      <button
        onClick={goNext}
        disabled={matches.length === 0}
        aria-label="Next match"
        title="Next match (Enter)"
        style={{
          all: "unset",
          cursor: matches.length === 0 ? "not-allowed" : "pointer",
          opacity: matches.length === 0 ? 0.35 : 1,
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--r-sm)",
          color: "var(--text-secondary)",
        }}
        onMouseEnter={(e) => { if (matches.length > 0) e.currentTarget.style.background = "var(--bg-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
      >
        <Icons.ChevronDown size={14} aria-hidden />
      </button>

      {/* Close search */}
      <button
        onClick={() => { onActiveMatchChange(null); onClose(); }}
        aria-label="Close search"
        title="Close search (Escape)"
        style={{
          all: "unset",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--r-sm)",
          color: "var(--text-secondary)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
      >
        <Icons.X size={14} aria-hidden />
      </button>

      {/* Visually hidden aria-live region — announces match count to screen readers */}
      <span
        id={announcerId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announceText}
      </span>
    </div>
  );
}
