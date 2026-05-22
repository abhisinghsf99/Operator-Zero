"use client";

/**
 * app/app/settings/_memory.tsx
 * Memory section — "What I Remember About You".
 *
 * Renders memory items grouped by category. Supports:
 *   - Inline edit (calls editMemoryItem)
 *   - Add new item per category (calls addMemoryItem)
 *   - Soft-delete with 24h Sonner undo toast (calls deleteMemoryItem / undoDeleteMemoryItem)
 *
 * SET-04: soft-delete sets soft_deleted_at; undo restores within 24h window.
 *
 * WCAG 2.1 AA:
 *   - aria-labelledby on section
 *   - role="alert" on errors
 *   - aria-busy on buttons during transitions
 *   - focus-visible ring on all interactive elements
 */
import { useState, useTransition, useId } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  addMemoryItem,
  editMemoryItem,
  deleteMemoryItem,
  undoDeleteMemoryItem,
} from "@/app/app/settings/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryItem {
  id: string;
  category: string;
  content: string;
  source_type: string | null;
  created_at: Date;
  updated_at: Date;
}

type MemoryCategory =
  | "brand"
  | "catalog"
  | "policy"
  | "preference"
  | "decision_history";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  brand: "Brand",
  catalog: "Catalog",
  policy: "Policy",
  preference: "Preference",
  decision_history: "Decision History",
};

const ALL_CATEGORIES: MemoryCategory[] = [
  "brand",
  "catalog",
  "policy",
  "preference",
  "decision_history",
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface MemorySectionProps {
  items: MemoryItem[];
}

export function MemorySection({ items: initialItems }: MemorySectionProps) {
  const [items, setItems] = useState(initialItems);
  const headingId = useId();

  // Which categories have at least one item (or all categories for adding)
  const categoriesWithItems = Array.from(new Set(items.map((i) => i.category)));
  const categoriesToShow = Array.from(
    new Set([...categoriesWithItems, ...ALL_CATEGORIES])
  ) as MemoryCategory[];

  function handleItemDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleItemEdited(id: string, newContent: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, content: newContent } : i))
    );
  }

  function handleItemAdded(item: MemoryItem) {
    setItems((prev) => [...prev, item]);
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="memory-section"
      className="mt-8"
    >
      <div className="mb-5">
        <h2
          id={headingId}
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          What I remember about you
        </h2>
        <p className="mt-1 max-w-[580px] text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          Everything the agent thinks it knows. Edit any line. Delete what&apos;s wrong.
          Add what&apos;s missing.
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {categoriesToShow.map((category) => {
          const categoryItems = items.filter((i) => i.category === category);
          return (
            <CategoryCard
              key={category}
              category={category}
              items={categoryItems}
              onDeleted={handleItemDeleted}
              onEdited={handleItemEdited}
              onAdded={handleItemAdded}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

interface CategoryCardProps {
  category: MemoryCategory;
  items: MemoryItem[];
  onDeleted: (id: string) => void;
  onEdited: (id: string, content: string) => void;
  onAdded: (item: MemoryItem) => void;
}

function CategoryCard({
  category,
  items,
  onDeleted,
  onEdited,
  onAdded,
}: CategoryCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAddPending, startAdd] = useTransition();

  const label = CATEGORY_LABELS[category] ?? category;

  function handleAddSubmit() {
    if (!newContent.trim()) return;
    startAdd(async () => {
      setAddError(null);
      const result = await addMemoryItem(newContent.trim(), category);
      if ("error" in result) {
        setAddError(result.error);
        return;
      }
      // Optimistically add to list
      onAdded({
        id: result.id,
        category,
        content: newContent.trim(),
        source_type: "user_explicit",
        created_at: new Date(),
        updated_at: new Date(),
      });
      setNewContent("");
      setIsAdding(false);
    });
  }

  function handleAddCancel() {
    setNewContent("");
    setIsAdding(false);
    setAddError(null);
  }

  return (
    <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
      {/* Category header */}
      <div className="flex items-center justify-between border-b-[0.5px] border-[var(--border)] px-4 py-3">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {label}
        </span>
        <button
          onClick={() => setIsAdding(true)}
          aria-label={`Add ${label} memory item`}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Items */}
      {items.map((item, idx) => (
        <MemoryItemRow
          key={item.id}
          item={item}
          isLast={idx === items.length - 1 && !isAdding}
          onDeleted={onDeleted}
          onEdited={onEdited}
        />
      ))}

      {/* Empty state when no items and not adding */}
      {items.length === 0 && !isAdding && (
        <div className="px-4 py-3 text-[12.5px] text-[var(--text-faint)] italic">
          Nothing yet — click + to add.
        </div>
      )}

      {/* Add new item row */}
      {isAdding && (
        <div className="border-t-[0.5px] border-[var(--border)] px-4 py-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={`Add a ${label.toLowerCase()} note…`}
            aria-label={`New ${label} memory item`}
            className="w-full resize-none rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[13.5px] leading-[1.55] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAddSubmit();
              }
              if (e.key === "Escape") handleAddCancel();
            }}
          />
          {addError && (
            <p className="mt-1.5 text-[12px] text-[var(--danger)]" role="alert">
              {addError}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleAddSubmit}
              disabled={isAddPending || !newContent.trim()}
              aria-busy={isAddPending}
            >
              {isAddPending ? "Adding…" : "Add"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddCancel}
              disabled={isAddPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Memory Item Row ──────────────────────────────────────────────────────────

interface MemoryItemRowProps {
  item: MemoryItem;
  isLast: boolean;
  onDeleted: (id: string) => void;
  onEdited: (id: string, content: string) => void;
}

function MemoryItemRow({ item, isLast, onDeleted, onEdited }: MemoryItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditPending, startEdit] = useTransition();
  const [isDeletePending, startDelete] = useTransition();

  function handleEditSubmit() {
    if (!editContent.trim()) return;
    startEdit(async () => {
      setEditError(null);
      const result = await editMemoryItem(item.id, editContent.trim());
      if (result && "error" in result) {
        setEditError(result.error);
        return;
      }
      onEdited(item.id, editContent.trim());
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteMemoryItem(item.id);
      if (result && "error" in result) {
        // Show error inline instead of toast
        setEditError(result.error);
        return;
      }
      // Optimistically remove from UI
      onDeleted(item.id);

      // Sonner undo toast — 24h undo window
      toast(`Memory deleted`, {
        description: "This item is still recoverable for 24 hours.",
        action: {
          label: "Undo",
          onClick: async () => {
            const undoResult = await undoDeleteMemoryItem(item.id);
            if (undoResult && "error" in undoResult) {
              toast.error("Could not restore item. It may have already been removed.");
            } else {
              toast.success("Memory restored.");
            }
          },
        },
        duration: 8000,
      });
    });
  }

  function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 ${
        !isLast ? "border-b-[0.5px] border-[var(--border)]" : ""
      }`}
    >
      {/* Bullet dot */}
      <div
        className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-[var(--text-faint)]"
        aria-hidden="true"
      />

      {/* Content — editable or display */}
      <div className="flex-1">
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              aria-label="Edit memory item"
              className="w-full resize-none rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-2 text-[13.5px] leading-[1.55] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleEditSubmit();
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditContent(item.content);
                  setEditError(null);
                }
              }}
            />
            {editError && (
              <p className="mt-1 text-[12px] text-[var(--danger)]" role="alert">
                {editError}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={handleEditSubmit}
                disabled={isEditPending}
                aria-busy={isEditPending}
                aria-label="Save edit"
                className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] bg-[var(--acc-workflow-ink)] text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1 disabled:opacity-50"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(item.content);
                  setEditError(null);
                }}
                aria-label="Cancel edit"
                className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--bg-deeper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <span className="text-[13.5px] leading-[1.55] text-[var(--text)]">
            {item.content}
          </span>
        )}
      </div>

      {/* Timestamp */}
      {!isEditing && (
        <span className="mt-0.5 flex-shrink-0 font-mono text-[11px] text-[var(--text-tertiary)]">
          {formatRelativeDate(item.updated_at)}
        </span>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => setIsEditing(true)}
            aria-label="Edit memory item"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeletePending}
            aria-busy={isDeletePending}
            aria-label="Delete memory item"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
