---
phase: quick-260526-kpx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/app/approvals/_preview.tsx
  - app/app/approvals/_detail.tsx
autonomous: true
requirements: [APRV-preview-render]

must_haves:
  truths:
    - "A Q&A/email approval (preview has string `draft`) shows the customer message and the drafted reply as clean, labeled prose blocks — no JSON anywhere in the Preview section."
    - "A before/after approval shows a labeled Before block and a labeled After block as prose."
    - "An item-list approval shows a tidy list (price `from → to`, OOS days, or compact fields) with optional `showing`/`window` captions."
    - "Any unrecognized preview shape still renders the existing pretty-printed JSON <pre> (no regression)."
    - "tsc strict passes and the existing test suite (351) stays green; nothing outside the Preview rendering changes."
  artifacts:
    - path: "app/app/approvals/_preview.tsx"
      provides: "Shape-aware ApprovalPreview renderer with typeof-narrowed branches"
      contains: "export function ApprovalPreview"
    - path: "app/app/approvals/_detail.tsx"
      provides: "Preview SectionHeader now wraps <ApprovalPreview> instead of raw JSON <pre>"
  key_links:
    - from: "app/app/approvals/_detail.tsx"
      to: "app/app/approvals/_preview.tsx"
      via: "import { ApprovalPreview } and render <ApprovalPreview preview={approval.preview} />"
      pattern: "ApprovalPreview"
---

<objective>
Replace the raw pretty-printed-JSON "Preview" block in the Approval Inbox detail panel with a clean, shape-aware renderer. The win case is Q&A/email-reply approvals (`action_type: "send_email_reply"`), whose `preview` JSONB is `{ customer, question, draft }` — today the customer's message is buried in JSON and the drafted reply renders as a code blob. After this change it reads like an actual email thread: the customer's question as an incoming quote, the drafted reply as clean prose.

Purpose: The Approval Inbox is the surface where Sarah exercises her judgment. A JSON blob defeats "trust through transparency" — she has to mentally parse a data structure instead of reading what the agent wants to do.

Output: A new presentational component `app/app/approvals/_preview.tsx` that branches on the preview's runtime shape, wired into `_detail.tsx` under the existing "Preview" SectionHeader. Strictly presentational — no server actions, DB, seed, edit panel, action bar, or keyboard logic touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

@app/app/approvals/_detail.tsx
@components/design/primitives.tsx

<interfaces>
<!-- Contracts the executor needs — already verified from the codebase. No exploration required. -->

`approval.preview` is typed `Record<string, unknown>` (PendingApproval in app/app/approvals/actions.ts:532).
The new component MUST accept it as-is and narrow with `typeof` guards. NO `any`. Use `unknown`-safe access:
- Read a field via `(preview as Record<string, unknown>).draft` then guard `typeof v === "string"`.
- For arrays: `Array.isArray((preview as Record<string, unknown>).items)`.

Exact seed shapes this renderer must handle (from lib/demo/seed.ts — these are the only shapes that exist):

1. EMAIL / Q&A  (action_type "send_email_reply"):
   { customer: string, question: string, draft: string }

2. BEFORE / AFTER  (e.g. shopify_update_product):
   { before: string, after: string }

3. ITEM LIST  (discounts / meta-title / inventory):
   { items: Array<object>, showing?: string, window?: string }
   item variants seen:
     price change:   { sku?: string, title: string, from: string, to: string }
     meta title:     { title: string, from: string, to: string }   // no sku
     OOS retire:     { title: string, oos_days: number }

4. FALLBACK: any other shape → render existing pretty-printed JSON <pre>.

SectionHeader + Card are imported from "@/components/design/primitives" (already used in _detail.tsx).
The existing Preview container is the styled <div> at _detail.tsx ~line 372-394 wrapping a <pre>.

CSS tokens available (verified in app/globals.css, light + dark):
--text, --text-secondary, --text-tertiary, --bg-subtle, --bg-elevated, --border,
--acc-approval, --acc-chat, --font-mono, --r-md.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the shape-aware ApprovalPreview renderer</name>
  <files>app/app/approvals/_preview.tsx</files>
  <action>
Create a new "use client" presentational component file exporting `ApprovalPreview({ preview }: { preview: Record&lt;string, unknown&gt; })`. It returns the inner content that sits inside the existing Preview container (the calling div in _detail.tsx keeps its border/background/padding — see Task 2 for the wiring decision; this component renders the CONTENT, not the outer card). Use inline token styles matching _detail.tsx (whiteSpace pre-wrap prose blocks, --font-mono kickers, var(--text-*) colors, var(--r-md) radii, 0.5px borders).

Narrowing helpers at top of file (no `any`): a `str(v: unknown): string | null` returning `v` when `typeof v === "string"` else null; reads come from `preview` cast to `Record&lt;string, unknown&gt;`.

Branch in this exact priority order on the narrowed preview:

1. EMAIL / Q&A — when `str(preview.draft)` is non-null. Render two stacked blocks, NO JSON:
   (a) Customer message: a mono kicker reading `CUSTOMER · {str(preview.customer) ?? "Customer"}` (uppercase, letterSpacing 0.08em, ~11px, --font-mono, --text-tertiary). Below it, `str(preview.question) ?? ""` as prose with whiteSpace "pre-wrap", color var(--text-secondary), ~13.5px, line-height 1.6. Style the block as an incoming quote: background var(--bg-subtle), borderRadius var(--r-md), padding ~12-14px, and a left hairline accent: borderLeft "2px solid var(--border)" (subtle, neutral — it is the incoming side).
   (b) Drafted reply: a mono kicker `DRAFTED REPLY` (same kicker style). Below it, `str(preview.draft)` as PROSE — sans font (do NOT set --font-mono; inherit sans), color var(--text), ~13.5px, line-height 1.6, whiteSpace "pre-wrap" — inside a card (background var(--bg-elevated), borderRadius var(--r-md), padding ~12-14px) with a subtle accent LEFT border: borderLeft "2px solid var(--acc-approval)". Gap ~12px between the two blocks.
   Accessibility: each block's kicker is a real text label preceding its content (label conveys meaning, not color alone) — WCAG preserved.

2. BEFORE / AFTER — else when both `str(preview.before)` and `str(preview.after)` are non-null. Two labeled prose blocks: a "Before" label (mono kicker style) with `str(preview.before)` in muted var(--text-tertiary) prose; then an "After" label with `str(preview.after)` in var(--text) prose inside a subtly highlighted block (background var(--bg-subtle) or a hairline-bordered card). whiteSpace "pre-wrap" on both. Labels are text, not color-only.

3. ITEM LIST — else when `Array.isArray(preview.items)`. Render an optional caption row at the top combining `str(preview.showing)` and `str(preview.window)` when present (small, var(--text-tertiary), ~11.5px; e.g. "3 of 8 · Fri 6pm – Mon 9am CT"). Then a tidy vertical list (gap ~6-8px, each row ~13px, var(--text)). Map each item (cast to `Record&lt;string, unknown&gt;`, guard fields):
     - if `str(from)` and `str(to)` present → render `{str(title) ?? str(sku) ?? "Item"}: {from} → {to}` (use a real arrow "→"; title primary, the from→to in var(--text-secondary)).
     - else if `typeof oos_days === "number"` → render `{str(title) ?? "Item"} · {oos_days} days OOS` (the "· N days OOS" in var(--text-tertiary)).
     - else → render `{str(title) ?? str(sku) ?? "Item"}` plus any other string fields compactly (key: value, var(--text-secondary)).
   Each row is a labeled line of text — no color-only encoding.

4. FALLBACK — else: render the existing pretty-printed JSON exactly as today: a `<pre>` with margin 0, overflowX "auto", whiteSpace "pre-wrap", fontSize 12.5, lineHeight 1.5, color var(--text-secondary), fontFamily var(--font-mono), containing `{JSON.stringify(preview, null, 2)}`. This guarantees no regression for unknown shapes.

Add a top-of-file doc comment describing the four branches and that it is presentational-only. Do NOT import server actions, DB, or anything beyond React types and (optionally) nothing from primitives — inline styles are fine and match the file's existing convention.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "approvals/_preview" || echo "PREVIEW_TS_CLEAN"</automated>
  </verify>
  <done>app/app/approvals/_preview.tsx exists, exports ApprovalPreview, compiles under tsc strict with no `any`, and contains all four shape branches with the FALLBACK preserving the existing JSON <pre>.</done>
</task>

<task type="auto">
  <name>Task 2: Wire ApprovalPreview into the detail panel (replace only the JSON pre)</name>
  <files>app/app/approvals/_detail.tsx</files>
  <action>
Import `ApprovalPreview` from "./_preview" at the top of _detail.tsx (alongside the existing local imports).

Replace ONLY the Preview rendering. Decide the container boundary cleanly: keep the existing `<SectionHeader>Preview</SectionHeader>` (line ~371) untouched. Replace the styled container div + inner `<pre>` (the block at ~lines 372-394 that has `border: "0.5px solid var(--border)"`, `background: "var(--bg-elevated)"`, `padding: 16`, `marginBottom: 24` and wraps `<pre>{JSON.stringify(approval.preview, null, 2)}</pre>`) with `<div style={{ marginBottom: 24 }}><ApprovalPreview preview={approval.preview} /></div>`.

Rationale for dropping the outer card border/bg: the EMAIL and BEFORE/AFTER branches render their own cards/quote blocks, so an additional outer card would double-nest. The FALLBACK branch's `<pre>` already lives inside the component, so JSON still renders fine — just without the redundant outer frame. (If you prefer to retain the outer frame for the fallback only, that is acceptable as long as the EMAIL/before-after/item branches are not double-framed; the simplest correct approach is the single marginBottom wrapper above.)

Do NOT touch: the reasoning Card, downstream-impact block, the Edit panel (textarea editing proposed_action as JSON stays exactly as-is), the sticky action bar, keyboard shortcuts (A/R/E/S), realtime/onResolved wiring, snooze/reject/revert dialogs, or any server action. The only diff in this file is the new import and the swapped Preview block.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "approvals/_detail" || echo "DETAIL_TS_CLEAN"; grep -c "ApprovalPreview" app/app/approvals/_detail.tsx; grep -c "JSON.stringify(approval.preview" app/app/approvals/_detail.tsx</automated>
  </verify>
  <done>_detail.tsx imports and renders &lt;ApprovalPreview preview={approval.preview} /&gt; under the existing Preview SectionHeader; the inline `JSON.stringify(approval.preview, ...)` <pre> is gone from _detail.tsx (count 0); the Edit panel's `JSON.stringify(approval.proposed_action, ...)` is untouched; tsc strict is clean.</done>
</task>

</tasks>

<verification>
Run from repo root:
- `npx tsc --noEmit` — zero errors (strict, no `any`).
- `npx vitest run` — all 351 tests green (no test touches the Preview rendering; this confirms no collateral breakage).
- Manual/visual (demo): open /app/approvals, select the "Reply to Maria G." item — confirm a CUSTOMER kicker + quoted question and a DRAFTED REPLY card with prose, no JSON. Select the discount item — confirm a from → to list with the "3 of 6 · window" caption. Select the Voyager description rewrite — confirm Before/After blocks. (Any seeded approval whose shape is unrecognized would still show JSON, but all seeded shapes are covered.)
</verification>

<success_criteria>
- Q&A/email-reply approvals render customer message + drafted reply as clean prose — zero JSON in the Preview section.
- Before/after and item-list shapes render with labeled prose / tidy lists.
- Unrecognized shapes fall back to the original pretty-printed JSON <pre> (no regression).
- Only the Preview rendering changed: Edit panel, action bar, shortcuts, realtime, server actions, seed, and DB are byte-for-byte unaffected (aside from the one import + Preview swap in _detail.tsx).
- WCAG preserved: every block carries a text label; nothing is encoded by color alone.
- `npx tsc --noEmit` clean; `npx vitest run` shows 351 passing.
</success_criteria>

<output>
Create `.planning/quick/260526-kpx-render-approval-preview-cleanly-especial/260526-kpx-SUMMARY.md` when done.
</output>
