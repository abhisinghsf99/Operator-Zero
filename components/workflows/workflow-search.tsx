"use client";

/**
 * components/workflows/workflow-search.tsx
 * "Find a workflow" client-side search input (D-17).
 *
 * D-17: Portfolio is small (5–20 workflows). Client-side fuzzy filter over the
 * loaded list — no server round-trip needed. Filter state lifted to parent
 * (_workflows-view.tsx) via onQueryChange.
 *
 * ACCESSIBILITY:
 *   - Input has aria-label
 *   - Clear button has aria-label
 */

import { useRef } from "react";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
}

// ─── WorkflowSearch ───────────────────────────────────────────────────────────

export function WorkflowSearch({ query, onQueryChange }: WorkflowSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {/* Search icon */}
      <span
        style={{
          position: "absolute",
          left: 10,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Find a workflow"
        aria-label="Find a workflow by name, description, or trigger type"
        data-testid="workflow-search-input"
        style={{
          height: 34,
          paddingLeft: 30,
          paddingRight: query ? 30 : 14,
          fontSize: 13,
          color: "var(--text-secondary)",
          background: "transparent",
          border: "0.5px solid var(--border-strong)",
          borderRadius: "var(--r-sm)",
          fontFamily: "inherit",
          outline: "none",
          minWidth: 180,
          transition: "border-color 0.12s, background 0.12s",
        }}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.borderColor =
            "var(--acc-workflow-ink)";
          (e.target as HTMLInputElement).style.background =
            "var(--bg-elevated)";
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.borderColor =
            "var(--border-strong)";
          (e.target as HTMLInputElement).style.background = "transparent";
        }}
      />

      {/* Clear button — visible when query is non-empty */}
      {query && (
        <button
          type="button"
          onClick={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          style={{
            position: "absolute",
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            background: "var(--bg-subtle)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: 0,
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
