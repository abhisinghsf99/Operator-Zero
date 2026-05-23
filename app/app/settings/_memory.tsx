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
import { Check, X } from "lucide-react";
import { IconButton } from "@/components/design/primitives";
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
    >
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id={headingId}
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          What I remember about you
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          Everything the agent thinks it knows. Edit any line. Delete what&apos;s wrong.
          Add what&apos;s missing.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: "0.5px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      {/* Category header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "0.5px solid var(--border-hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <IconButton
          icon="Plus"
          size={24}
          onClick={() => setIsAdding(true)}
          title={`Add ${label} memory item`}
          aria-label={`Add ${label} memory item`}
        />
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
        <div
          style={{
            padding: "12px 16px",
            fontSize: 12.5,
            color: "var(--text-faint)",
            fontStyle: "italic",
          }}
        >
          Nothing yet — click + to add.
        </div>
      )}

      {/* Add new item row */}
      {isAdding && (
        <div
          style={{
            borderTop: "0.5px solid var(--border)",
            padding: "12px 16px",
          }}
        >
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={`Add a ${label.toLowerCase()} note…`}
            aria-label={`New ${label} memory item`}
            style={{
              width: "100%",
              resize: "none" as "none",
              borderRadius: "var(--r-sm)",
              border: "0.5px solid var(--border)",
              background: "var(--bg-subtle)",
              padding: "10px",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--text)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box" as "border-box",
            }}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
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
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }} role="alert">
              {addError}
            </p>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={handleAddSubmit}
              disabled={isAddPending || !newContent.trim()}
              aria-busy={isAddPending}
              aria-label="Save new memory item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 28,
                padding: "0 12px",
                borderRadius: "var(--r-sm)",
                background: "var(--acc-workflow-ink)",
                color: "white",
                border: "none",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: isAddPending || !newContent.trim() ? "not-allowed" : "pointer",
                opacity: isAddPending || !newContent.trim() ? 0.5 : 1,
                fontFamily: "inherit",
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
            >
              {isAddPending ? "Adding…" : "Add"}
            </button>
            <button
              onClick={handleAddCancel}
              disabled={isAddPending}
              aria-label="Cancel adding memory item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 28,
                padding: "0 12px",
                borderRadius: "var(--r-sm)",
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "0.5px solid var(--border-strong)",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: isAddPending ? "not-allowed" : "pointer",
                opacity: isAddPending ? 0.5 : 1,
                fontFamily: "inherit",
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
            >
              Cancel
            </button>
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
      style={{
        padding: "12px 16px",
        borderBottom: !isLast ? "0.5px solid var(--border-hairline)" : "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      {/* Bullet dot */}
      <div
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "var(--text-faint)",
          marginTop: 8,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />

      {/* Content — editable or display */}
      <div style={{ flex: 1 }}>
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              aria-label="Edit memory item"
              style={{
                width: "100%",
                resize: "none" as "none",
                borderRadius: "var(--r-sm)",
                border: "0.5px solid var(--border)",
                background: "var(--bg-subtle)",
                padding: "8px",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--text)",
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box" as "border-box",
              }}
              className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
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
              <p style={{ marginTop: 4, fontSize: 12, color: "var(--danger)" }} role="alert">
                {editError}
              </p>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button
                onClick={handleEditSubmit}
                disabled={isEditPending}
                aria-busy={isEditPending}
                aria-label="Save edit"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "var(--r-sm)",
                  background: "var(--acc-workflow-ink)",
                  color: "white",
                  border: "none",
                  cursor: isEditPending ? "not-allowed" : "pointer",
                  opacity: isEditPending ? 0.5 : 1,
                }}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg-subtle)",
                  color: "var(--text-tertiary)",
                  border: "none",
                  cursor: "pointer",
                }}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text)" }}>
            {item.content}
          </span>
        )}
      </div>

      {/* Timestamp */}
      {!isEditing && (
        <span
          style={{
            marginTop: 2,
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          {formatRelativeDate(item.updated_at)}
        </span>
      )}

      {/* Actions */}
      {!isEditing && (
        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 2 }}>
          <IconButton
            icon="Edit"
            size={24}
            onClick={() => setIsEditing(true)}
            title="Edit memory item"
            aria-label="Edit memory item"
          />
          <IconButton
            icon="Trash"
            size={24}
            onClick={handleDelete}
            title="Delete memory item"
            aria-label="Delete memory item"
          />
        </div>
      )}
    </div>
  );
}
