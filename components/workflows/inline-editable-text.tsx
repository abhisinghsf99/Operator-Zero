"use client";

/**
 * components/workflows/inline-editable-text.tsx
 * Click-to-edit text primitive (D-01 / RESEARCH "Inline Edit Click-to-Edit Pattern").
 *
 * Behavior (per plan task 2):
 *   - Click span → input appears with autoFocus
 *   - Enter or blur → saves via onSave (only if value changed)
 *   - Escape → reverts to original value without saving
 *   - No separate "Save" button (RESEARCH Pitfall 3 — blur fires before click; avoid double-save)
 *   - isPending guard prevents double-save
 *
 * ACCESSIBILITY:
 *   - Editable span has role="button" + tabIndex when not editing
 *   - Input has aria-label describing what is being edited
 *   - Reduced-motion: no transitions on focus/blur beyond color changes
 *
 * Source analog: inline-approval-card.tsx useState + isPending pattern (lines 128-130, 186-203)
 */

import { useState, useRef, useCallback } from "react";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface InlineEditableTextProps {
  /** Current displayed value */
  value: string;
  /** Async save handler — receives the new value, returns void (throws on error) */
  onSave: (newValue: string) => Promise<void>;
  /** Accessible label for the input field (e.g., "Workflow name") */
  ariaLabel?: string;
  /** Placeholder shown in input when empty */
  placeholder?: string;
  /** CSS className for the display span */
  className?: string;
  /** Inline style for the display span */
  style?: React.CSSProperties;
  /** Extra style applied to the input */
  inputStyle?: React.CSSProperties;
  /** Whether this component is interactive (defaults true) */
  editable?: boolean;
}

// ─── InlineEditableText ───────────────────────────────────────────────────────

export function InlineEditableText({
  value,
  onSave,
  ariaLabel = "Edit value",
  placeholder = "Enter value",
  className,
  style,
  inputStyle,
  editable = true,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we're in the middle of an Escape cancel to skip the blur save
  const cancelledRef = useRef(false);

  const handleClick = useCallback(() => {
    if (!editable || isEditing) return;
    setDraft(value);
    cancelledRef.current = false;
    setIsEditing(true);
  }, [editable, isEditing, value]);

  // Save on blur — only if value changed and not cancelled (Pitfall 3: no save button)
  const handleBlur = useCallback(async () => {
    // Escape was pressed — skip save
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setIsEditing(false);
      setDraft(value);
      return;
    }

    const trimmed = draft.trim();
    // No change — skip save
    if (trimmed === value.trim()) {
      setIsEditing(false);
      return;
    }

    // Empty value — revert
    if (!trimmed) {
      setIsEditing(false);
      setDraft(value);
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      await onSave(trimmed);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsEditing(false);
      setDraft(value); // Revert on error
    } finally {
      setIsPending(false);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        // Enter saves — trigger blur which handles the save
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        // Escape cancels — set flag before blur fires
        cancelledRef.current = true;
        e.currentTarget.blur();
      }
    },
    []
  );

  if (isEditing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={isPending}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        style={{
          background: "var(--bg)",
          border: "0.5px solid var(--acc-workflow-ink)",
          borderRadius: "var(--r-xs)",
          padding: "2px 6px",
          fontSize: "inherit",
          fontFamily: "inherit",
          fontWeight: "inherit",
          color: "var(--text)",
          outline: "none",
          width: "100%",
          opacity: isPending ? 0.7 : 1,
          cursor: isPending ? "not-allowed" : "text",
          ...inputStyle,
        }}
        data-testid="inline-editable-input"
      />
    );
  }

  return (
    <span
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      title={editable ? `Click to edit: ${ariaLabel}` : undefined}
      aria-label={editable ? `${ariaLabel}: ${value || placeholder}. Click to edit.` : undefined}
      className={className}
      style={{
        cursor: editable ? "text" : "default",
        ...style,
      }}
      data-testid="inline-editable-text"
    >
      {error ? (
        <span style={{ color: "var(--danger)", fontSize: "0.85em" }}>
          {error}
        </span>
      ) : (
        value || (
          <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
            {placeholder}
          </span>
        )
      )}
    </span>
  );
}
