---
phase: quick-260531-tsg
plan: 01
subsystem: approvals-ui
tags: [approvals, preview, html-sanitizer, discriminated-union, xss-guard, accessibility]
dependency_graph:
  requires: [260529-f4g, 260529-jk4, 260529-jxq]
  provides: [APRV-PREVIEW-RENDER]
  affects: [app/app/approvals, components/chat/inline-approval-card]
tech_stack:
  added: []
  patterns: [discriminated-union preview model, shared sanitizer, semantic dl/dt/dd markup]
key_files:
  created:
    - lib/html/sanitize.ts
    - lib/approvals/preview-model.ts
    - tests/unit/preview-model.test.ts
  modified:
    - lib/agent/generation/optimize-description.ts
    - app/app/approvals/_preview.tsx
    - app/app/approvals/_detail.tsx
    - components/chat/inline-approval-card.tsx
decisions:
  - "buildPreviewModel detects shapes by key presence (not just `kind`) to cover smart-tool payloads that carry no kind field"
  - "HTML values carried raw in PreviewModel (sanitized at render only) to keep the model pure and serializable"
  - "Generic fallback uses compactSummary (single-line key:val join) for nested objects — never JSON.stringify with indentation"
  - "fields branch uses <dl>/<dt>/<dd> for a11y (WCAG 2.1 AA) on Inbox surface; PreviewRow-derived cards on chat surface"
  - "sanitizeHtml extracted verbatim from optimize-description.ts — behavior identical, T-f4g-01 guarantees preserved"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-31"
  tasks_completed: 2
  files_changed: 7
---

# Phase quick-260531-tsg Plan 01: Fix Approval Preview Rendering Across Both Surfaces Summary

**One-liner:** Shared sanitizer + pure `buildPreviewModel` discriminated union wired to both Inbox detail and inline chat card — no more escaped-JSON dump for any approval shape.

## What Was Built

### Task 1: Extract shared sanitizer + build pure buildPreviewModel (TDD)

**RED:** `tests/unit/preview-model.test.ts` — 35 tests covering every PreviewModel branch (empty, text, email, diff, list, html, fields, generic fallback) plus sanitizeHtml coverage. Tests confirmed failing before implementation.

**GREEN:** Three files created/modified:

- `lib/html/sanitize.ts` — exports `sanitizeHtml` verbatim from `optimize-description.ts` (T-f4g-01 / T-tsg-01). No behavior change; same regex passes; same JSDoc.
- `lib/approvals/preview-model.ts` — exports `buildPreviewModel(preview, actionType?) → PreviewModel` discriminated union. Pure data-only (no JSX). Detection priority: null/empty → `{ kind:'empty' }`, scalar → `{ kind:'text' }`, email (by kind/draft/to+subject+body) → `{ kind:'email' }`, diff (by kind/before+after) → `{ kind:'diff' }`, list (by kind/items array) → `{ kind:'list' }`, body_html → `{ kind:'html', title:'Product description' }`, meta_title/meta_description → `{ kind:'fields' }` with char counts, variant_gid+inventory_qty → `{ kind:'fields' }` restock rows (including qty=0 → "0 units"), generic fallback → `{ kind:'fields' }` humanized labels.
- `lib/agent/generation/optimize-description.ts` — replaced local `function sanitizeHtml` with `import { sanitizeHtml } from "@/lib/html/sanitize"`. generateOptimizedDescription behavior unchanged.

**Test results:** 39 tests passed (35 preview-model + 4 optimize-description tests re-green after extraction).

### Task 2: Wire both approval surfaces to buildPreviewModel

- `app/app/approvals/_preview.tsx` — completely rebuilt on `buildPreviewModel`. Branches off discriminated union for all 7 kinds. HTML rendered via `sanitizeHtml + dangerouslySetInnerHTML`. Fields use `<dl>/<dt>/<dd>` semantic markup (WCAG 2.1 AA). JSON.stringify fallback removed.
- `app/app/approvals/_detail.tsx` — 1-line touch: `<ApprovalPreview preview={approval.preview} actionType={approval.action_type} />`. `action_type` confirmed present on `PendingApproval` type.
- `components/chat/inline-approval-card.tsx` — rebuilt `ApprovalPreview` local component on `buildPreviewModel`. All 7 PreviewModel variants covered. Existing email/diff/list visual styling preserved. HTML and html-flagged fields use `sanitizeHtml + dangerouslySetInnerHTML`. `actionType` prop threaded through to `ApprovalPreview`. JSON.stringify fallback removed.

## Verification Results

```
npm run typecheck: PASSED (clean, no errors)
npx vitest run tests/unit/preview-model.test.ts tests/unit/optimize-description.test.ts: PASSED (39 tests)
grep JSON.stringify(preview _preview.tsx inline-approval-card.tsx: 0 matches (clean)
grep buildPreviewModel _preview.tsx: 3 occurrences (import + call)
grep buildPreviewModel inline-approval-card.tsx: 2 occurrences (import + call)
WIRED_OK: confirmed
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The `_detail.tsx` call-site update (passing `actionType={approval.action_type}`) was flagged in the plan constraints as mandatory — implemented as directed.

For the `fields` branch in `inline-approval-card.tsx`, `PreviewRow` was not used with an empty label (which would render oddly). Instead, a simple styled div matching the card's existing visual language was used for field values — same visual weight, cleaner markup. This is a rendering-detail variation within the same card surface; not a behavioral deviation.

## Known Stubs

None — all preview shapes are wired to real data from the `preview` jsonb column. No placeholder text or hardcoded empty values introduced.

## Threat Flags

No new threat surface introduced. All mitigations from the plan's threat register are implemented:

| Threat ID | Mitigation |
|-----------|-----------|
| T-tsg-01 | All HTML model values (`html` kind + `html:true` fields) rendered only via `sanitizeHtml()` inside `dangerouslySetInnerHTML`. Unit test asserts script/onerror/javascript: stripping. |
| T-tsg-SC | No new dependencies added (DOMPurify not used; regex sanitizer reused). |

## Out-of-Scope Follow-Ups

Per plan spec, the following were intentionally NOT implemented:
- Changing tool logic / proposed_action shapes
- The workflow engine (execute-workflow-run.ts) and runWorkflowStep
- Enriching restock preview with rationale (rationale is not in proposed_action)
- DB/schema changes

## Self-Check: PASSED

All 7 files found on disk. All 3 commits found in git log (8305666, cf1c5ef, 929b1b7). Zero JSON.stringify(preview occurrences in both surface files. buildPreviewModel imported in both surfaces. sanitizeHtml imported from @/lib/html/sanitize in optimize-description.ts. Local sanitizeHtml definition removed from optimize-description.ts. 39 tests green. typecheck clean.
