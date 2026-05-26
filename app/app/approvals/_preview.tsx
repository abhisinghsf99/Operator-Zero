"use client";

/**
 * app/app/approvals/_preview.tsx
 *
 * Shape-aware ApprovalPreview renderer — strictly presentational.
 *
 * Branches (in priority order):
 *   1. EMAIL / Q&A  — preview has `draft: string`
 *      Renders customer message as an incoming quote block + drafted reply as clean prose.
 *   2. BEFORE / AFTER — preview has `before: string` and `after: string`
 *      Renders two labeled prose blocks (before / after).
 *   3. ITEM LIST — preview has `items: Array<object>`
 *      Renders optional caption + tidy row-per-item list with from→to or OOS days.
 *   4. FALLBACK — any other shape
 *      Renders the existing pretty-printed JSON <pre> (no regression for unknown shapes).
 *
 * No server actions, DB imports, or business logic. Inline styles match _detail.tsx conventions.
 * All fields narrowed via `typeof` / `Array.isArray` guards — no `any`.
 */

// ─── Narrowing helpers ────────────────────────────────────────────────────────

/** Returns the value as a string if it is one, otherwise null. */
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// ─── Shared kicker style ──────────────────────────────────────────────────────

const kickerStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function EmailPreview({ preview }: { preview: Record<string, unknown> }) {
  const customer = str(preview.customer) ?? "Customer";
  const question = str(preview.question) ?? "";
  const draft = str(preview.draft) ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Customer message — incoming quote block */}
      <div
        style={{
          background: "var(--bg-subtle)",
          borderRadius: "var(--r-md)",
          borderLeft: "2px solid var(--border)",
          padding: "12px 14px",
        }}
      >
        <span style={kickerStyle}>CUSTOMER · {customer}</span>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {question}
        </p>
      </div>

      {/* Drafted reply — clean prose card */}
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--r-md)",
          borderLeft: "2px solid var(--acc-approval)",
          padding: "12px 14px",
        }}
      >
        <span style={kickerStyle}>DRAFTED REPLY</span>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
          }}
        >
          {draft}
        </p>
      </div>
    </div>
  );
}

function BeforeAfterPreview({ preview }: { preview: Record<string, unknown> }) {
  const before = str(preview.before) ?? "";
  const after = str(preview.after) ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Before */}
      <div>
        <span style={kickerStyle}>BEFORE</span>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text-tertiary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {before}
        </p>
      </div>

      {/* After */}
      <div
        style={{
          background: "var(--bg-subtle)",
          borderRadius: "var(--r-md)",
          padding: "12px 14px",
          border: "0.5px solid var(--border)",
        }}
      >
        <span style={kickerStyle}>AFTER</span>
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
          }}
        >
          {after}
        </p>
      </div>
    </div>
  );
}

function ItemListPreview({ preview }: { preview: Record<string, unknown> }) {
  const items = preview.items as Array<unknown>;
  const showing = str(preview.showing);
  const window_ = str(preview.window);

  const caption = [showing, window_].filter(Boolean).join(" · ");

  return (
    <div>
      {caption && (
        <p
          style={{
            margin: 0,
            marginBottom: 10,
            fontSize: 11.5,
            color: "var(--text-tertiary)",
          }}
        >
          {caption}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, idx) => {
          const row = (item ?? {}) as Record<string, unknown>;
          const title = str(row.title);
          const sku = str(row.sku);
          const from = str(row.from);
          const to = str(row.to);
          const oosDays = typeof row.oos_days === "number" ? row.oos_days : null;

          let label: string;
          let detail: React.ReactNode;

          if (from !== null && to !== null) {
            // Price / meta-title change: "Title: from → to"
            label = title ?? sku ?? "Item";
            detail = (
              <>
                {": "}
                <span style={{ color: "var(--text-secondary)" }}>
                  {from} {"→"} {to}
                </span>
              </>
            );
          } else if (oosDays !== null) {
            // OOS retire: "Title · N days OOS"
            label = title ?? "Item";
            detail = (
              <span style={{ color: "var(--text-tertiary)" }}>
                {" · "}{oosDays} days OOS
              </span>
            );
          } else {
            // Generic: title plus any other string fields
            label = title ?? sku ?? "Item";
            const extras = Object.entries(row)
              .filter(([k]) => k !== "title" && k !== "sku")
              .map(([k, v]) => str(v) !== null ? `${k}: ${str(v)}` : null)
              .filter((s): s is string => s !== null)
              .join(", ");
            detail = extras ? (
              <span style={{ color: "var(--text-secondary)" }}>{" — "}{extras}</span>
            ) : null;
          }

          return (
            <div key={idx} style={{ fontSize: 13, color: "var(--text)" }}>
              <span>{label}</span>
              {detail}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ApprovalPreview ──────────────────────────────────────────────────────────

export function ApprovalPreview({ preview }: { preview: Record<string, unknown> }) {
  // Branch 1: EMAIL / Q&A — has a string `draft`
  if (str(preview.draft) !== null) {
    return <EmailPreview preview={preview} />;
  }

  // Branch 2: BEFORE / AFTER — has both string `before` and string `after`
  if (str(preview.before) !== null && str(preview.after) !== null) {
    return <BeforeAfterPreview preview={preview} />;
  }

  // Branch 3: ITEM LIST — has an array `items`
  if (Array.isArray(preview.items)) {
    return <ItemListPreview preview={preview} />;
  }

  // Branch 4: FALLBACK — unknown shape, render pretty-printed JSON
  return (
    <pre
      style={{
        margin: 0,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        fontSize: 12.5,
        lineHeight: 1.5,
        color: "var(--text-secondary)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {JSON.stringify(preview, null, 2)}
    </pre>
  );
}
