"use client";

/**
 * app/app/approvals/_preview.tsx
 *
 * Shape-aware ApprovalPreview renderer — strictly presentational.
 * Branches off buildPreviewModel() for ALL shape detection and fallback.
 *
 * No server actions, DB imports, or business logic.
 * All fields narrowed via typeof / Array.isArray guards — no `any`.
 * HTML values rendered via sanitizeHtml + dangerouslySetInnerHTML (T-tsg-01).
 * Accessible: definition-list (<dl>/<dt>/<dd>) for field rows (WCAG 2.1 AA).
 */

import { buildPreviewModel } from "@/lib/approvals/preview-model";
import { sanitizeHtml } from "@/lib/html/sanitize";

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
  const to = str(preview.to);
  const subject = str(preview.subject);
  const body = str(preview.body);

  // Chat-style email {to,subject,body} (no draft)
  if (to !== null || subject !== null || body !== null) {
    return (
      <div
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
        }}
      >
        {to !== null && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--bg-subtle)",
              borderBottom: "0.5px solid var(--border-hairline)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <strong style={{ color: "var(--text)", fontWeight: 500 }}>To:</strong>{" "}
            {to}
          </div>
        )}
        {subject !== null && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--bg-elevated)",
              borderBottom: body !== null ? "0.5px solid var(--border-hairline)" : undefined,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text)",
            }}
          >
            {subject}
          </div>
        )}
        {body !== null && (
          <div
            style={{
              padding: "14px 16px",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </div>
        )}
      </div>
    );
  }

  // Q&A style: customer quote + drafted reply
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

function BeforeAfterPreview({ before, after }: { before: string; after: string }) {
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

function ItemListPreview({
  items,
  showing,
  window: window_,
}: {
  items: Array<Record<string, unknown>>;
  showing?: string;
  window?: string;
}) {
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
        {items.map((row, idx) => {
          const title = str(row.title);
          const sku = str(row.sku);
          const from = str(row.from);
          const to = str(row.to);
          const oosDays = typeof row.oos_days === "number" ? row.oos_days : null;

          let label: string;
          let detail: React.ReactNode;

          if (from !== null && to !== null) {
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
            label = title ?? "Item";
            detail = (
              <span style={{ color: "var(--text-tertiary)" }}>
                {" · "}{oosDays} days OOS
              </span>
            );
          } else {
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

function HtmlPreview({ title, html }: { title: string; html: string }) {
  return (
    <div>
      <span style={kickerStyle}>{title.toUpperCase()}</span>
      <div
        className="prose-preview"
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--text)",
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    </div>
  );
}

function FieldsPreview({
  fields,
}: {
  fields: Array<{ label: string; value: string; count?: string; html?: boolean }>;
}) {
  return (
    <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {fields.map((field, idx) => (
        <div
          key={idx}
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          <dt style={kickerStyle}>{field.label}</dt>
          <dd style={{ margin: 0 }}>
            {field.html === true ? (
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--text)",
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(field.value) }}
              />
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {field.value}
              </p>
            )}
            {field.count !== undefined && (
              <span
                style={{
                  display: "block",
                  marginTop: 2,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                }}
              >
                {field.count}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ─── ApprovalPreview ──────────────────────────────────────────────────────────

export function ApprovalPreview({
  preview,
  actionType,
}: {
  preview: Record<string, unknown>;
  actionType?: string;
}) {
  const model = buildPreviewModel(preview, actionType);

  switch (model.kind) {
    case "email":
      return (
        <EmailPreview
          preview={{
            customer: model.customer,
            question: model.question,
            draft: model.draft,
            to: model.to,
            subject: model.subject,
            body: model.body,
          }}
        />
      );

    case "diff":
      return <BeforeAfterPreview before={model.before} after={model.after} />;

    case "list":
      return (
        <ItemListPreview
          items={model.items}
          showing={model.showing}
          window={model.window}
        />
      );

    case "html":
      return <HtmlPreview title={model.title} html={model.html} />;

    case "fields":
      return <FieldsPreview fields={model.fields} />;

    case "text":
      return (
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {model.text}
        </p>
      );

    case "empty":
      return null;
  }
}
