---
phase: quick-260531-tsg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/html/sanitize.ts
  - lib/agent/generation/optimize-description.ts
  - lib/approvals/preview-model.ts
  - tests/unit/preview-model.test.ts
  - app/app/approvals/_preview.tsx
  - components/chat/inline-approval-card.tsx
autonomous: true
requirements: [APRV-PREVIEW-RENDER]
must_haves:
  truths:
    - "An L2 approval for shopify_optimize_product_description shows the generated description as rendered HTML (headings/lists), never an escaped-JSON dump — on BOTH the Inbox detail and the inline chat card."
    - "An L2 approval for shopify_optimize_meta shows labeled Meta title / Meta description rows with character counts (e.g. 52/60, 138/160) on both surfaces."
    - "An L2 approval for shopify_propose_restock shows 'Restock to N units' (including N=0) on both surfaces — never falls through to JSON."
    - "Any other unrecognized proposed_action object renders as humanized label/value field rows (Title Case labels), never JSON.stringify escaped output."
    - "The existing email/before-after/list previews continue to render with their current visual styling on each surface."
    - "Script/event-handler/javascript: payloads embedded in any HTML preview value are stripped before render (T-f4g-01 guarantee preserved)."
  artifacts:
    - path: lib/html/sanitize.ts
      provides: "Shared sanitizeHtml — extracted from optimize-description.ts, identical behavior"
      exports: ["sanitizeHtml"]
    - path: lib/approvals/preview-model.ts
      provides: "Pure buildPreviewModel(preview, actionType?) → discriminated-union PreviewModel"
      exports: ["buildPreviewModel", "PreviewModel"]
    - path: tests/unit/preview-model.test.ts
      provides: "Unit coverage for every PreviewModel branch + sanitizer strip"
  key_links:
    - from: app/app/approvals/_preview.tsx
      to: lib/approvals/preview-model.ts
      via: "import { buildPreviewModel }"
      pattern: "buildPreviewModel"
    - from: components/chat/inline-approval-card.tsx
      to: lib/approvals/preview-model.ts
      via: "import { buildPreviewModel }"
      pattern: "buildPreviewModel"
    - from: lib/agent/generation/optimize-description.ts
      to: lib/html/sanitize.ts
      via: "import { sanitizeHtml }"
      pattern: "from \"@/lib/html/sanitize\""
    - from: app/app/approvals/_preview.tsx
      to: lib/html/sanitize.ts
      via: "sanitizeHtml(value) inside dangerouslySetInnerHTML"
      pattern: "sanitizeHtml"
---

<objective>
Fix the L2 approval preview so it renders a clean, human-readable preview for EVERY workflow/agent action across BOTH approval surfaces (Inbox detail `app/app/approvals/_preview.tsx` and inline chat card `components/chat/inline-approval-card.tsx`) — never the raw escaped-JSON dump.

Root cause (verified, do not re-derive): both surfaces special-case a few shapes and otherwise fall through to `JSON.stringify(preview, null, 2)`. The three smart-tool proposed-action shapes (`{body_html}`, `{meta_title,meta_description}`, `{inventory_qty}`) carry no `kind` and hit that fallback, producing an escaped-JSON dump.

Fix is render-layer only: (1) extract the existing `sanitizeHtml` into a shared module and reuse it; (2) introduce a single pure `buildPreviewModel` that maps any preview payload to a discriminated union with a humanized generic fallback (never JSON.stringify); (3) drive BOTH surfaces off `buildPreviewModel` and delete both JSON.stringify fallbacks.

Purpose: "Trust through transparency" — Sarah must always see a legible preview of what the agent proposes to do, regardless of action type.
Output: shared sanitizer, pure preview model + tests, both renderers wired to it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from codebase — executor should use these directly, no exploration needed. -->

Existing sanitizer to EXTRACT (currently PRIVATE in lib/agent/generation/optimize-description.ts, lines ~149-172).
Signature and exact behavior to preserve verbatim (T-f4g-01):
```
function sanitizeHtml(raw: string): string
// strips: ```fences```, `inline code`, <script>…</script>, <style>…</style>,
//         <iframe>…</iframe>, on*= handlers, javascript: URLs; returns html.trim()
```
After extraction, optimize-description.ts MUST import it from "@/lib/html/sanitize" and keep `generateOptimizedDescription` behavior identical (its tests in tests/unit/optimize-description.test.ts must still pass — note test (d) "strips a <script> tag").

Approval row preview shapes that flow through the renderer (from lib/agent/tools/write/index.ts extractProposedAction + existing real write tools):
- optimize description (Tool 12):  { product_gid: string, body_html: string }
- optimize meta (Tool 13):         { product_gid: string, meta_title?: string, meta_description?: string }
- propose restock (Tool 14):       { variant_gid: string, inventory_qty: number }   // includes 0
- existing real write tools also flow their zod input shapes through preview (e.g. { product_gid, description }, { variant_gid, price }, { thread_id, body, subject }, { path, target }, { page_gid, body_html, title }) — all must land on a clean branch, never JSON.

Existing kind/value-based payloads already handled (KEEP working):
- chat card (kind-based): kind==='content-diff' {before,after}; kind==='email' {to,subject,body}; kind==='list' {items:[{from,to}]}
- inbox (value-based): string `draft` (+customer/question) → EMAIL; string `before`+`after` → BEFORE/AFTER; Array `items` (rows with title/sku/from/to/oos_days) → LIST

Inbox detail passes preview as: `approval.preview` (Record<string,unknown>); action type available as `approval.action_type` (PendingApproval.action_type, actions.ts ~553-570).
Chat card passes preview as: `preview?: Record<string,unknown>` prop; action type available as `actionType: string` (InlineApprovalCardProps, inline-approval-card.tsx ~46-67).

Safe-render reference pattern (react-markdown, no rehype-raw): components/chat/content-preview.tsx. NOTE: smart-tool body_html is HTML (not markdown), so render via sanitizeHtml + dangerouslySetInnerHTML — NOT react-markdown.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract shared sanitizer + build pure buildPreviewModel with full unit coverage</name>
  <files>lib/html/sanitize.ts, lib/agent/generation/optimize-description.ts, lib/approvals/preview-model.ts, tests/unit/preview-model.test.ts</files>
  <behavior>
    sanitizeHtml (extracted, unchanged behavior):
    - Test: strips a `<script>alert(1)</script>` payload → result contains no `<script`.
    - Test: strips an `onerror=` event-handler attribute → result contains no `onerror`.
    - Test: strips a `javascript:` URL → result contains no `javascript:`.
    buildPreviewModel(preview, actionType?) discriminated union — detect by KEYS, ALSO honor explicit `kind` when present. Priority order:
    - Test: { kind:'email' } OR string `draft` (+optional customer/question) OR { to, subject, body } → kind 'email' carrying customer/question/draft and/or to/subject/body strings.
    - Test: { before:'old', after:'new' } (both strings) OR kind 'content-diff' → { kind:'diff', before:'old', after:'new' }.
    - Test: { items:[{from,to}] } OR kind 'list' → { kind:'list', items, showing?, window? }.
    - Test: { product_gid, body_html:'<h2>Hi</h2><ul><li>a</li></ul>' } → { kind:'html', title:'Product description', html:'<h2>…' }. (raw html carried in model, NOT sanitized in model.)
    - Test: { product_gid, meta_title:'Buy our great mug today', meta_description:'A long meta description for SEO purposes here.' } → { kind:'fields', fields:[{label:'Meta title', value, count:`${value.length}/60`}, {label:'Meta description', value, count:`${value.length}/160`}] }. Only-present fields included (meta_description-only must yield exactly one field).
    - Test: { variant_gid, inventory_qty: 0 } → { kind:'fields', fields:[{label:'Restock to', value:'0 units'}, {label:'Variant', value:variant_gid}] } — MUST render '0 units', NOT empty/fallback.
    - Test (generic fallback): { foo_bar:'baz', widget_count:3, banner_html:'<p onclick="x">hi</p>' } → { kind:'fields', fields includes {label:'Foo bar', value:'baz'}, {label:'Widget count', value:'3'}, and a field for banner_html where html-looking string is flagged html:true and carries the raw string }. Assert NO field value equals a JSON.stringify of the object (no escaped-JSON output anywhere).
    - Test: nested object/array value in generic fallback → produces a compact one-line summary string (not raw JSON.stringify with newlines/escapes).
    - Test (scalar): buildPreviewModel('just a string') → { kind:'text', text:'just a string' }.
    - Test (empty): buildPreviewModel(null) and buildPreviewModel({}) → { kind:'empty' }.
  </behavior>
  <action>
    Create `lib/html/sanitize.ts`: move the EXACT `sanitizeHtml` function body from lib/agent/generation/optimize-description.ts (lines ~149-172) verbatim, export it. No behavior change — same regex passes, same T-f4g-01 guarantees, same JSDoc. Then edit optimize-description.ts: delete the local `sanitizeHtml` definition and add `import { sanitizeHtml } from "@/lib/html/sanitize";`. Do not touch generateOptimizedDescription logic otherwise (its tests must stay green).

    Create `lib/approvals/preview-model.ts` exporting a discriminated-union type `PreviewModel` and a pure function `buildPreviewModel(preview: unknown, actionType?: string): PreviewModel`. Data-only model (strings/flags/booleans) — NO JSX, so it is trivially unit-testable and serializable. Branch detection keyed on KEYS but ALSO accepting explicit `kind` (for the chat card's existing kind-based payloads), in the priority order specified in <behavior>. PreviewModel variants:
      - { kind:'email'; customer?:string; question?:string; draft?:string; to?:string; subject?:string; body?:string }
      - { kind:'diff'; before:string; after:string }
      - { kind:'list'; items:Array<Record<string,unknown>>; showing?:string; window?:string }
      - { kind:'html'; title:string; html:string }   // raw html string, sanitized at RENDER time only
      - { kind:'fields'; fields:Array<{ label:string; value:string; count?:string; html?:boolean }> }  // html:true ⇒ `value` is a raw HTML string to be sanitized+dangerouslySetInnerHTML at render
      - { kind:'text'; text:string }
      - { kind:'empty' }
    Generic fallback (any other non-null object): map each own enumerable key → field { label: humanize(key) (snake_case/camelCase → Title Case), value: scalar stringified, html: true only when the string value matches /<[a-z][\s\S]*>/i (carry that raw string as value), nested object/array → compact one-line summary (e.g. JSON on a single line trimmed, or `key: v1, k2: v2` — anything that is NOT JSON.stringify(…, null, 2) escaped multi-line output) }. NEVER emit JSON.stringify with indentation. Scalar/string/number/boolean preview (non-object) → { kind:'text', text:String(preview) }. null/undefined/empty-object → { kind:'empty' }. TypeScript strict: narrow every access with typeof/Array.isArray, no `any`. Add a small `humanize(key:string):string` helper.

    Create `tests/unit/preview-model.test.ts` mirroring the existing pure-function test style (see tests/unit/optimize-description.test.ts header/describe/it conventions; no DB/LLM mocks needed here — buildPreviewModel and sanitizeHtml are pure). Cover every case in <behavior>, including the explicit assertions that no field value is an escaped JSON.stringify dump and that inventory_qty:0 renders "0 units". Also import sanitizeHtml from "@/lib/html/sanitize" and assert it strips `<script>`, `onerror=`, and `javascript:` payloads.
  </action>
  <verify>
    <automated>npm run typecheck && npx vitest run tests/unit/preview-model.test.ts tests/unit/optimize-description.test.ts</automated>
  </verify>
  <done>lib/html/sanitize.ts exports sanitizeHtml; optimize-description.ts imports it (grep `from "@/lib/html/sanitize"`) and no longer defines `function sanitizeHtml`; lib/approvals/preview-model.ts exports buildPreviewModel + PreviewModel; preview-model.test.ts passes all branch + sanitizer cases; optimize-description.test.ts still green; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire both approval surfaces to buildPreviewModel and delete JSON.stringify fallbacks</name>
  <files>app/app/approvals/_preview.tsx, components/chat/inline-approval-card.tsx</files>
  <action>
    Rewire BOTH ApprovalPreview implementations to branch off `buildPreviewModel(preview, actionType?)` and render its discriminated union. Keep each surface's existing visual styling (Inbox prose/cards via inline styles; chat PreviewRow/email-card styling) — change the DETECTION + FALLBACK source, not the look of the already-handled cases. Remove BOTH `JSON.stringify(preview` fallbacks entirely.

    In `app/app/approvals/_preview.tsx`: import `buildPreviewModel` from "@/lib/approvals/preview-model" and `sanitizeHtml` from "@/lib/html/sanitize". Change `ApprovalPreview` to accept an optional `actionType?: string` alongside `preview`, build the model, and switch on `model.kind`:
      - 'email' → existing EmailPreview styling (customer quote + drafted reply); for chat-style {to,subject,body} email payloads, render those rows too.
      - 'diff' → BeforeAfterPreview styling.
      - 'list' → ItemListPreview styling.
      - 'html' → kicker label = model.title, then a prose block rendered via `<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(model.html) }} />` styled to match the existing prose blocks (inherit _detail prose styles).
      - 'fields' → render label/value rows (reuse kicker label style for the label; value as prose; show `count` as a small monospace caption when present); for any field with `html:true`, render its value via `dangerouslySetInnerHTML={{ __html: sanitizeHtml(field.value) }}`. Use semantic markup (a definition-list `<dl><dt>/<dd>` or labeled rows) for accessibility (a11y non-negotiable).
      - 'text' → single prose `<p>` with `whiteSpace:'pre-wrap'`.
      - 'empty' → render nothing (null).
    Update the caller in `app/app/approvals/_detail.tsx`? NO — _detail.tsx is in scope only if needed; pass action_type by having ApprovalPreview read it. Since _detail.tsx renders `<ApprovalPreview preview={approval.preview} />`, add the optional `actionType` prop and update that one call site to `<ApprovalPreview preview={approval.preview} actionType={approval.action_type} />` (this is a 1-line touch inside _detail.tsx — include _detail.tsx only if the prop add requires it; otherwise default actionType undefined is acceptable). Prefer adding the prop + updating the call site.

    In `components/chat/inline-approval-card.tsx`: import `buildPreviewModel` and `sanitizeHtml`. Replace the local kind-based `ApprovalPreview` body so it calls `buildPreviewModel(preview, actionType)` (actionType is already a prop on InlineApprovalCardProps) and renders the same discriminated union, reusing the existing `PreviewRow` component and email-card / list markup for 'email'/'diff'/'list'. Add rendering for 'html' (sanitized dangerouslySetInnerHTML inside a styled block), 'fields' (PreviewRow-style label/value rows; html-flagged fields sanitized), 'text', and 'empty'. The card already passes `preview` to ApprovalPreview at ~382-384; thread `actionType` through to it.

    Optional unification: if the visual treatments unify cleanly, extract a shared `components/approvals/preview-body.tsx` taking a PreviewModel; if not, both surfaces MUST at minimum branch off buildPreviewModel so detection + fallback cannot drift. (Not required to add the shared component — only required that neither file contains `JSON.stringify(preview` and both import buildPreviewModel.)

    TypeScript strict throughout; no `any`. Keep all existing aria-labels/roles intact.
  </action>
  <verify>
    <automated>npm run typecheck && bash -c '! grep -n "JSON.stringify(preview" app/app/approvals/_preview.tsx components/chat/inline-approval-card.tsx && grep -lq "buildPreviewModel" app/app/approvals/_preview.tsx && grep -lq "buildPreviewModel" components/chat/inline-approval-card.tsx && echo WIRED_OK'</automated>
  </verify>
  <done>Neither app/app/approvals/_preview.tsx nor components/chat/inline-approval-card.tsx contains `JSON.stringify(preview`; both import and branch off buildPreviewModel; html/fields render via sanitizeHtml; existing email/diff/list visuals preserved; typecheck clean; the verify command prints WIRED_OK.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| proposed_action jsonb → preview render | LLM-generated body_html / meta strings stored in the approval row are rendered as HTML in the browser |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tsg-01 | Tampering/Elevation (XSS) | preview-body html render on both surfaces | mitigate | All HTML model values (`html` kind + `html:true` fields) rendered ONLY via `sanitizeHtml()` (shared, extracted T-f4g-01 sanitizer) inside dangerouslySetInnerHTML. No raw HTML reaches the DOM unsanitized. Unit test asserts script/onerror/javascript: stripping. |
| T-tsg-02 | Information Disclosure | generic fallback field rendering | accept | Fallback renders the same proposed_action data the owner already sees in the Edit panel; preview is owner-scoped (RLS + user_id-filtered fetch upstream). No new data surfaced. |
| T-tsg-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies introduced (DOMPurify explicitly NOT installed; reuse extracted regex sanitizer). No install step → no supply-chain surface added. |
</threat_model>

<verification>
- `npm run typecheck` passes (TypeScript strict).
- `npx vitest run tests/unit/preview-model.test.ts tests/unit/optimize-description.test.ts` passes (new model+sanitizer tests green; existing description tests still green after extraction).
- `grep -n "JSON.stringify(preview" app/app/approvals/_preview.tsx components/chat/inline-approval-card.tsx` returns nothing.
- Both surface files import `buildPreviewModel`; optimize-description.ts imports sanitizeHtml from "@/lib/html/sanitize".
- Manual check (post-merge): Approval Inbox "Optimize description" approval shows formatted description (rendered h2/list); meta shows labeled Title/Description with counts; restock shows "Restock to N units".
</verification>

<success_criteria>
- Every L2 approval preview (optimize-description, optimize-meta, propose-restock, all existing real write tools, and any unknown object shape) renders a clean, human-readable preview on BOTH the Inbox detail and the inline chat card — never an escaped-JSON dump.
- A single pure `buildPreviewModel` is the sole shape-detection authority; both surfaces consume it; detection + fallback cannot drift.
- The sanitizer is shared (one definition) and reused at render time; no new dependency added; proposed_action / tool logic / workflow engine untouched.
</success_criteria>

<output>
Create `.planning/quick/260531-tsg-fix-approval-preview-rendering-across-bo/260531-tsg-SUMMARY.md` when done.

Out-of-scope follow-ups (note in SUMMARY, do NOT implement): changing tool logic / proposed_action shapes; the workflow engine (execute-workflow-run.ts) and runWorkflowStep; enriching restock with rationale (rationale isn't in proposed_action); DB/schema changes.
</output>
