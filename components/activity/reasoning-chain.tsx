"use client";

/**
 * components/activity/reasoning-chain.tsx
 * Reasoning chain renderer — inline or blob-fetched (Discretion 4).
 *
 * If reasoning_chain (JSONB) is non-null, renders inline.
 * If reasoning_chain is null and reasoning_chain_url is present,
 * fetches the blob from Supabase Storage on expand.
 *
 * SECURITY:
 *   Values are rendered as text (React auto-escapes).
 *   No dangerouslySetInnerHTML used.
 *
 * ACCESSIBILITY (WCAG 2.1 AA):
 *   - Expand/collapse button: aria-expanded
 *   - Loading state: aria-busy
 *   - Region: aria-label
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReasoningChainProps {
  /** Inline reasoning chain JSONB (small chains, preferred) */
  reasoning_chain: unknown;
  /** URL to Supabase Storage blob (large chains, fetched on demand) */
  reasoning_chain_url: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render a single step from the reasoning chain */
function renderStep(step: unknown, index: number): React.ReactNode {
  if (typeof step === "string") {
    return (
      <li
        key={index}
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {step}
      </li>
    );
  }
  if (typeof step === "object" && step !== null) {
    const obj = step as Record<string, unknown>;
    const text =
      typeof obj["step"] === "string"
        ? obj["step"]
        : typeof obj["text"] === "string"
        ? obj["text"]
        : typeof obj["content"] === "string"
        ? obj["content"]
        : JSON.stringify(step);
    return (
      <li
        key={index}
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {text}
      </li>
    );
  }
  return (
    <li
      key={index}
      style={{
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "var(--text-tertiary)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {String(step)}
    </li>
  );
}

function renderChain(chain: unknown): React.ReactNode {
  if (Array.isArray(chain)) {
    return (
      <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
        {chain.map((step, i) => renderStep(step, i))}
      </ul>
    );
  }
  if (typeof chain === "string") {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {chain}
      </p>
    );
  }
  if (typeof chain === "object" && chain !== null) {
    // Render as JSON for objects we don't recognize
    return (
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(chain, null, 2)}
      </pre>
    );
  }
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
      {String(chain)}
    </p>
  );
}

// ─── ReasoningChain ────────────────────────────────────────────────────────────

export function ReasoningChain({
  reasoning_chain,
  reasoning_chain_url,
}: ReasoningChainProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchedChain, setFetchedChain] = useState<unknown>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const hasInline = reasoning_chain !== null && reasoning_chain !== undefined;
  const hasUrl = !!reasoning_chain_url;

  // No reasoning chain available
  if (!hasInline && !hasUrl) {
    return null;
  }

  async function handleExpand() {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    // If inline, nothing more to do
    if (hasInline) return;

    // Fetch from Supabase Storage on first expand (Discretion 4)
    if (!fetchedChain && hasUrl && !isLoading) {
      setIsLoading(true);
      setFetchError(null);

      try {
        const supabase = createBrowserClient(
          process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
          process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!
        );

        // Extract the storage path from the URL
        // reasoning_chain_url is a full Supabase Storage URL
        const url = new URL(reasoning_chain_url!);
        const pathParts = url.pathname.split("/storage/v1/object/public/");
        if (pathParts.length < 2) {
          throw new Error("Invalid reasoning chain URL format");
        }
        const [bucketAndPath] = pathParts[1]!.split("/", 1);
        const filePath = pathParts[1]!.slice((bucketAndPath?.length ?? 0) + 1);
        const bucket = bucketAndPath ?? "reasoning-chains";

        const { data, error } = await supabase.storage
          .from(bucket)
          .download(filePath);

        if (error || !data) {
          throw new Error(error?.message ?? "Failed to fetch reasoning chain");
        }

        const text = await data.text();
        try {
          setFetchedChain(JSON.parse(text));
        } catch {
          setFetchedChain(text);
        }
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : "Failed to load reasoning chain"
        );
      } finally {
        setIsLoading(false);
      }
    }
  }

  const chainToRender = hasInline ? reasoning_chain : fetchedChain;

  return (
    <section aria-label="Reasoning chain">
      {/* Header / toggle button */}
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={isExpanded}
        aria-controls="reasoning-chain-content"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "var(--text)",
          fontSize: 12.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
          width: "100%",
          textAlign: "left",
        }}
      >
        {isExpanded ? (
          <ChevronDown size={13} aria-hidden="true" />
        ) : (
          <ChevronRight size={13} aria-hidden="true" />
        )}
        Reasoning chain
        {hasUrl && !hasInline && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            (stored)
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div
          id="reasoning-chain-content"
          aria-busy={isLoading}
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "var(--bg)",
            borderRadius: "var(--r-sm)",
            border: "0.5px solid var(--border)",
          }}
        >
          {isLoading && (
            <p
              aria-live="polite"
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--text-tertiary)",
                fontStyle: "italic",
              }}
            >
              Loading reasoning chain...
            </p>
          )}
          {fetchError && (
            <p
              role="alert"
              aria-live="assertive"
              style={{ margin: 0, fontSize: 12.5, color: "var(--danger)" }}
            >
              {fetchError}
            </p>
          )}
          {chainToRender !== null &&
            chainToRender !== undefined &&
            !isLoading &&
            renderChain(chainToRender)}
        </div>
      )}
    </section>
  );
}
