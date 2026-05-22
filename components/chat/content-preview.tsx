"use client";

/**
 * components/chat/content-preview.tsx
 * Sanitized markdown content preview for embedded drafts.
 *
 * CONV-07: Content drafts render as embedded previews.
 * Renders markdown via react-markdown (sanitizing renderer).
 *
 * SECURITY (T-2-06-02 — XSS via content-preview):
 *   - react-markdown renders safe React elements — no raw HTML injection
 *   - rehype-raw is NOT used — disables raw HTML passthrough
 *   - This prevents XSS from model-generated markdown content
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Rendered markdown is semantic HTML (headings, lists, etc.)
 *   - Optional title announced as a heading
 */

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface ContentPreviewProps {
  /** Markdown content to render (sanitized — no raw HTML passthrough) */
  content: string;
  /** Optional display title for the preview */
  title?: string;
  className?: string;
}

export function ContentPreview({ content, title, className }: ContentPreviewProps) {
  if (!content) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]",
        "overflow-hidden",
        className
      )}
    >
      {/* Preview header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Draft Preview
        </span>
        {title && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span className="truncate text-xs font-medium text-[var(--text-secondary)]">
              {title}
            </span>
          </>
        )}
      </div>

      {/* Sanitized markdown content */}
      <div className="px-4 py-3">
        <ReactMarkdown
          // SECURITY: rehype-raw is NOT included — raw HTML passthrough is disabled.
          // react-markdown's default renderer produces safe React elements only.
          // This prevents XSS from model-generated content (T-2-06-02).
          components={{
            // Style markdown elements to match the design system
            h1: ({ children }) => (
              <h1 className="mb-2 text-sm font-semibold text-[var(--text)]">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-1.5 text-xs font-semibold text-[var(--text)]">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-1 text-xs font-medium text-[var(--text)]">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="mb-2 text-xs leading-relaxed text-[var(--text)] last:mb-0">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="mb-2 ml-3 list-disc space-y-0.5 text-xs text-[var(--text)]">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-2 ml-3 list-decimal space-y-0.5 text-xs text-[var(--text)]">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            strong: ({ children }) => (
              <strong className="font-semibold text-[var(--text)]">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-[var(--text-secondary)]">{children}</em>
            ),
            code: ({ children }) => (
              <code className="rounded bg-[var(--bg-deeper)] px-1 py-0.5 font-mono text-[10px] text-[var(--text)]">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mb-2 overflow-x-auto rounded-lg bg-[var(--bg-deeper)] p-3 font-mono text-[10px] text-[var(--text)]">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mb-2 border-l-2 border-[var(--border)] pl-3 text-xs italic text-[var(--text-secondary)]">
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
