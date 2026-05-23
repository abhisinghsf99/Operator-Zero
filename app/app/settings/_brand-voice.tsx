"use client";

/**
 * app/app/settings/_brand-voice.tsx
 * Brand Voice section — markdown editor + live preview + encrypted save + regenerate-with-confirm.
 *
 * SECURITY:
 *   T-4-03-03: react-markdown WITHOUT rehype-raw — no raw HTML passthrough (XSS prevention, [02-06])
 *   T-4-03-04: regenerateBrandVoice returns draft only; user must confirm before Save
 *
 * WCAG 2.1 AA:
 *   - aria-labelledby on the section
 *   - aria-busy on buttons during transitions
 *   - role="alert" on error messages
 *   - focus-visible ring on all interactive elements
 */
import { useState, useTransition, useId } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/design/primitives";
import { saveBrandVoice, regenerateBrandVoice } from "@/app/app/settings/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button as ShadcnButton } from "@/components/ui/button";

interface BrandVoiceSectionProps {
  initialMarkdown: string;
}

export function BrandVoiceSection({ initialMarkdown }: BrandVoiceSectionProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isSaving, startSave] = useTransition();
  const [isRegenerating, startRegenerate] = useTransition();

  const headingId = useId();

  function handleSave() {
    startSave(async () => {
      setError(null);
      setSaveSuccess(false);
      const result = await saveBrandVoice(markdown);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSaveSuccess(true);
    });
  }

  function handleRegenerate() {
    startRegenerate(async () => {
      setError(null);
      const result = await regenerateBrandVoice();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // T-4-03-04: load draft without overwriting current content
      setDraft(result.draft);
      setConfirmOpen(true);
    });
  }

  function handleConfirmReplace() {
    if (draft !== null) {
      setMarkdown(draft);
      setDraft(null);
    }
    setConfirmOpen(false);
    setSaveSuccess(false);
  }

  function handleCancelReplace() {
    setDraft(null);
    setConfirmOpen(false);
  }

  return (
    <section aria-labelledby={headingId} data-testid="brand-voice-section">
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id={headingId}
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Brand voice profile
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 580 }}>
          The reference document the agent reads before every content-generating action.
          Write it like you&apos;d brief a new contractor.
        </p>
      </div>

      {/* Editor + Preview — two-column layout per design */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Editor pane */}
        <div
          style={{
            borderRadius: "var(--r-lg)",
            border: "0.5px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
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
              }}
            >
              Markdown
            </span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {markdown.length} chars
            </span>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value);
              setSaveSuccess(false);
            }}
            aria-label="Brand voice markdown editor"
            aria-multiline="true"
            style={{
              all: "unset" as "unset",
              display: "block",
              width: "100%",
              padding: "14px 16px",
              minHeight: 460,
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "var(--text)",
              resize: "vertical" as "vertical",
              boxSizing: "border-box" as "border-box",
            }}
            spellCheck={false}
          />
        </div>

        {/* Preview pane */}
        <div
          style={{
            borderRadius: "var(--r-lg)",
            border: "0.5px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "0.5px solid var(--border-hairline)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Preview
            </span>
          </div>
          {/* T-4-03-03: react-markdown without rehype-raw — no raw HTML passthrough */}
          <div
            style={{ padding: "16px 18px", fontSize: 13.5, lineHeight: 1.65, color: "var(--text)" }}
            className="prose prose-sm max-w-none [&_h1]:display [&_h1]:text-[20px] [&_h1]:tracking-[-0.01em] [&_h2]:text-[14px] [&_h2]:font-medium [&_li]:text-[var(--text-secondary)] [&_p]:text-[var(--text-secondary)]"
          >
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <Button
          variant="primary"
          accent="chat"
          icon="Check"
          onClick={handleSave}
          disabled={isSaving}
          aria-busy={isSaving}
          data-testid="brand-voice-save"
        >
          {isSaving ? "Saving…" : saveSuccess ? "Saved" : "Save"}
        </Button>
        <Button
          variant="ghost"
          icon="Sparkles"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          aria-busy={isRegenerating}
          data-testid="brand-voice-regenerate"
        >
          {isRegenerating ? "Generating…" : "Regenerate from examples"}
        </Button>
      </div>

      {error && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {/* Confirm-before-replace dialog — T-4-03-04 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace brand voice with AI draft?</DialogTitle>
            <DialogDescription>
              A new draft has been generated from your writing samples. Replacing
              will load the draft into the editor — your current content will not
              be lost until you click Save.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-[var(--r-sm)] bg-[var(--bg-subtle)] p-3 font-mono text-[12px] leading-[1.6] text-[var(--text-secondary)]">
              <pre className="whitespace-pre-wrap">{draft.slice(0, 400)}{draft.length > 400 ? "…" : ""}</pre>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <ShadcnButton
                variant="secondary"
                size="sm"
                onClick={handleCancelReplace}
              >
                Keep current
              </ShadcnButton>
            </DialogClose>
            <ShadcnButton
              variant="default"
              size="sm"
              onClick={handleConfirmReplace}
              data-testid="brand-voice-confirm-replace"
            >
              Load draft
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
