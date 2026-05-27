"use client";

/**
 * components/chat/chat-header-menu.tsx
 * Custom accessible ⋯ More popover for the chat thread header.
 *
 * ACTIONS:
 *   Rename       — Dialog with controlled input → renameThread → onRenamed callback
 *   Delete       — Confirm Dialog → soft deleteThread (archived_at) → navigate away
 *   Copy transcript — navigator.clipboard → toast (graceful fallback)
 *   Pin / Unpin  — atomic togglePinThread → onPinnedChange callback
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Popover is role="menu"; items are role="menuitem" with tabIndex managed
 *   - Opens on click; closes on outside click, Escape, or item activation
 *   - Focus moves to first item on open; returns to ⋯ button on close
 *   - Arrow Up/Down cycle focus between items (wrapping)
 *   - aria-haspopup="menu" + aria-expanded on the trigger button
 *   - Respects prefers-reduced-motion (no transition on open/close)
 */

import { useRef, useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconButton } from "@/components/design/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { renameThread, deleteThread, togglePinThread } from "@/app/app/chat/actions";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ChatHeaderMenuProps {
  threadId: string;
  threadTitle: string;
  pinned: boolean;
  /** Subset of messages needed for transcript generation */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  onRenamed: (newTitle: string) => void;
  onPinnedChange: (pinned: boolean) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ChatHeaderMenu({
  threadId,
  threadTitle,
  pinned,
  messages,
  onRenamed,
  onPinnedChange,
}: ChatHeaderMenuProps) {
  const router = useRouter();
  const menuId = useId();

  // Popover state
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(threadTitle);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sync rename input with prop when dialog opens
  useEffect(() => {
    if (renameDialogOpen) setRenameValue(threadTitle);
  }, [renameDialogOpen, threadTitle]);

  // Reduced-motion preference
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // ─── Open / close helpers ───────────────────────────────────────────────────

  const closeMenu = useCallback(() => {
    setOpen(false);
    // Restore focus to trigger button (first focusable child of wrapper span)
    requestAnimationFrame(() => {
      const btn = triggerWrapRef.current?.querySelector<HTMLButtonElement>("button");
      btn?.focus();
    });
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    // Move focus to first menu item
    requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      items?.[0]?.focus();
    });
  }, []);

  const toggleMenu = useCallback(() => {
    if (open) closeMenu();
    else openMenu();
  }, [open, openMenu, closeMenu]);

  // ─── Outside click to close ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, closeMenu]);

  // ─── Keyboard handling for menu ─────────────────────────────────────────────

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
      );
      if (items.length === 0) return;
      const focused = document.activeElement as HTMLButtonElement;
      const idx = items.indexOf(focused);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    },
    [closeMenu]
  );

  // ─── Menu actions ────────────────────────────────────────────────────────────

  const handleRenameClick = () => {
    setOpen(false);
    setRenameDialogOpen(true);
  };

  const handleDeleteClick = () => {
    setOpen(false);
    setDeleteDialogOpen(true);
  };

  const handleCopyTranscript = async () => {
    closeMenu();
    const lines: string[] = [];
    for (const m of messages) {
      const label = m.role === "user" ? "**You:**" : "**Orchestrator:**";
      lines.push(`${label}\n${m.content}`);
    }
    const transcript = lines.join("\n\n");

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard not available in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(transcript);
      toast.success("Transcript copied");
    } catch {
      toast.error("Failed to copy transcript — check browser permissions.");
    }
  };

  const handlePin = async () => {
    closeMenu();
    const result = await togglePinThread(threadId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onPinnedChange(result.pinned);
    router.refresh();
    toast.success(result.pinned ? "Pinned to top" : "Unpinned");
  };

  const handleRenameSave = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameLoading(true);
    const result = await renameThread(threadId, trimmed);
    setRenameLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onRenamed(trimmed);
    router.refresh();
    toast.success("Thread renamed");
    setRenameDialogOpen(false);
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    const result = await deleteThread(threadId);
    setDeleteLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Conversation deleted");
    setDeleteDialogOpen(false);
    router.push("/app/chat");
  };

  // ─── Menu item style helper ──────────────────────────────────────────────────

  const menuItemStyle: React.CSSProperties = {
    all: "unset",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text)",
    cursor: "pointer",
    borderRadius: "var(--r-sm)",
    width: "100%",
    boxSizing: "border-box",
    transition: prefersReducedMotion ? "none" : "background 0.1s",
  };

  const menuItemHoverStyle: React.CSSProperties = {
    background: "var(--bg-subtle)",
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger container — position:relative anchors the popover */}
      <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
        {/* Trigger button — wrapper span lets us find the button for focus-restore */}
        <span ref={triggerWrapRef} tabIndex={-1} style={{ display: "contents" }}>
          <IconButton
            icon="More"
            title="More options"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggleMenu}
            active={open}
          />
        </span>

        {/* Popover menu */}
        {open && (
          <div
            ref={menuRef}
            role="menu"
            id={menuId}
            aria-label="Thread options"
            onKeyDown={handleMenuKeyDown}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 188,
              background: "var(--bg-elevated)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-md)",
              padding: "4px",
              zIndex: 50,
            }}
          >
            {/* Rename */}
            <button
              role="menuitem"
              tabIndex={0}
              style={menuItemStyle}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, menuItemHoverStyle)}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              onClick={handleRenameClick}
            >
              Rename
            </button>

            {/* Delete */}
            <button
              role="menuitem"
              tabIndex={-1}
              style={{ ...menuItemStyle, color: "var(--danger)" }}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, { background: "color-mix(in oklch, var(--danger) 8%, var(--bg))" })}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--danger)"; }}
              onClick={handleDeleteClick}
            >
              Delete
            </button>

            {/* Copy transcript */}
            <button
              role="menuitem"
              tabIndex={-1}
              style={menuItemStyle}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, menuItemHoverStyle)}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              onClick={() => { void handleCopyTranscript(); }}
            >
              Copy transcript
            </button>

            {/* Pin / Unpin */}
            <button
              role="menuitem"
              tabIndex={-1}
              style={menuItemStyle}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, menuItemHoverStyle)}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              onClick={() => { void handlePin(); }}
            >
              {pinned ? "Unpin" : "Pin to top"}
            </button>
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              Enter a new name for this conversation thread.
            </DialogDescription>
          </DialogHeader>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameSave();
            }}
            placeholder="Thread name"
            maxLength={256}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              background: "var(--bg-deeper)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--r-sm)",
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--acc-chat-ink)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <button
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "7px 14px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              onClick={() => void handleRenameSave()}
              disabled={renameLoading || !renameValue.trim()}
              style={{
                all: "unset",
                cursor: renameLoading || !renameValue.trim() ? "not-allowed" : "pointer",
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--bg)",
                background: "var(--text)",
                borderRadius: "var(--r-sm)",
                opacity: renameLoading || !renameValue.trim() ? 0.5 : 1,
              }}
            >
              {renameLoading ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              It will be removed from your list. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "7px 14px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              onClick={() => void handleDeleteConfirm()}
              disabled={deleteLoading}
              style={{
                all: "unset",
                cursor: deleteLoading ? "not-allowed" : "pointer",
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--bg)",
                background: "var(--danger)",
                borderRadius: "var(--r-sm)",
                opacity: deleteLoading ? 0.5 : 1,
              }}
            >
              {deleteLoading ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
