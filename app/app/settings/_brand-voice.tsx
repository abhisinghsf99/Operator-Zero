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
import { Button } from "@/components/ui/button";
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
      <div className="mb-5">
        <h2
          id={headingId}
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Brand voice profile
        </h2>
        <p className="mt-1 max-w-[580px] text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          The reference document the agent reads before every content-generating action.
          Write it like you&apos;d brief a new contractor.
        </p>
      </div>

      {/* Editor + Preview — two-column layout per design */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Editor pane */}
        <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="flex items-center justify-between border-b-[0.5px] border-[var(--border)] px-3.5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              Markdown
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
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
            className="block w-full resize-y bg-transparent p-3.5 font-mono text-[12.5px] leading-[1.7] text-[var(--text)] focus-visible:outline-none"
            style={{ minHeight: 460 }}
            spellCheck={false}
          />
        </div>

        {/* Preview pane */}
        <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="border-b-[0.5px] border-[var(--border)] px-3.5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              Preview
            </span>
          </div>
          {/* T-4-03-03: react-markdown without rehype-raw — no raw HTML passthrough */}
          <div className="prose prose-sm max-w-none p-4 text-[13.5px] leading-[1.65] text-[var(--text)] [&_h1]:display [&_h1]:text-[20px] [&_h1]:tracking-[-0.01em] [&_h2]:text-[14px] [&_h2]:font-medium [&_li]:text-[var(--text-secondary)] [&_p]:text-[var(--text-secondary)]">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3.5 flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          aria-busy={isSaving}
          data-testid="brand-voice-save"
        >
          {isSaving ? "Saving…" : saveSuccess ? "Saved" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          aria-busy={isRegenerating}
          data-testid="brand-voice-regenerate"
        >
          {isRegenerating ? "Generating…" : "Regenerate from examples"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-[12.5px] text-[var(--danger)]" role="alert">
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
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancelReplace}
              >
                Keep current
              </Button>
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmReplace}
              data-testid="brand-voice-confirm-replace"
            >
              Load draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
