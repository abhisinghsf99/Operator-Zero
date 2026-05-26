---
phase: quick-260526-kpx
plan: "01"
subsystem: approvals-ui
tags: [approval-inbox, preview-renderer, presentational, wcag]
dependency_graph:
  requires: []
  provides: [shape-aware-approval-preview]
  affects: [app/app/approvals/_detail.tsx]
tech_stack:
  added: []
  patterns: [inline-styles-token-vars, typeof-narrowing-no-any, shape-branching]
key_files:
  created:
    - app/app/approvals/_preview.tsx
  modified:
    - app/app/approvals/_detail.tsx
decisions:
  - Preview outer card dropped in favour of a plain marginBottom wrapper — email and before/after branches render their own cards; double-nesting would have been visually incorrect.
  - JSON fallback preserved byte-for-byte in the new component to guarantee no regression for unrecognised preview shapes.
  - Each branch leads with a text kicker (CUSTOMER, DRAFTED REPLY, BEFORE, AFTER) so meaning is conveyed by text, not colour — WCAG 2.1 AA preserved.
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 2
---

# Quick Task 260526-kpx: Render Approval Preview Cleanly Summary

**One-liner:** Shape-aware ApprovalPreview component replacing raw JSON <pre> with email-thread prose, before/after prose blocks, and from/to item lists — JSON fallback retained.

## What Was Built

A new presentational component `app/app/approvals/_preview.tsx` that branches on the runtime shape of `approval.preview` (typed `Record<string, unknown>`) and renders each known shape as readable UI instead of a JSON blob.

**Branch 1 — EMAIL / Q&A** (`preview.draft` is a string): customer message as an incoming quote block with a neutral left-border hairline; drafted reply as clean sans prose with a `var(--acc-approval)` left accent. No JSON anywhere.

**Branch 2 — BEFORE / AFTER** (`preview.before` and `preview.after` are strings): two stacked labeled prose blocks — "before" in muted `var(--text-tertiary)`, "after" in a lightly highlighted card.

**Branch 3 — ITEM LIST** (`preview.items` is an array): optional `showing · window` caption, then one row per item — `Title: from → to` for price/meta-title changes, `Title · N days OOS` for inventory retirements, compact key/value fallback for other item shapes.

**Branch 4 — FALLBACK**: the original `<pre>` with `JSON.stringify(preview, null, 2)` — zero regression for any unrecognised shape.

`_detail.tsx` change: one new import, the old 22-line outer-card+`<pre>` block replaced by a 3-line `<div style={{ marginBottom: 24 }}><ApprovalPreview /></div>`.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Build the shape-aware ApprovalPreview renderer | 72d7194 | app/app/approvals/_preview.tsx |
| 2 | Wire ApprovalPreview into the detail panel | 6453e56 | app/app/approvals/_detail.tsx |

## Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run` — 351 passed, 3 skipped, 12 todo (all pre-existing)
- No `any` casts — all field access via `str(v: unknown)` helper + `Array.isArray`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — purely presentational; no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- app/app/approvals/_preview.tsx: FOUND
- app/app/approvals/_detail.tsx: modified (ApprovalPreview count=2, raw preview JSON count=0)
- Commit 72d7194: FOUND
- Commit 6453e56: FOUND
