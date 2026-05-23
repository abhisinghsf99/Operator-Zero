---
phase: quick-260523-1jq
plan: "01"
subsystem: integrations/shopify
tags: [ui, oauth, shopify, client-validation, tdd]
dependency_graph:
  requires: []
  provides:
    - lib/integrations/shopify/shop-domain.ts
    - components/onboarding/connect-step.tsx (Shopify domain prompt)
    - app/app/settings/_connections.tsx (Shopify domain dialog)
  affects:
    - Shopify OAuth connect flow (onboarding + settings)
tech_stack:
  added: []
  patterns:
    - TDD RED→GREEN for pure normalizer helper
    - Client-safe module pattern (no server/Node imports) for "use client" compatibility
    - Inline domain input with token-driven styles (no Input primitive available)
    - Radix Dialog for settings domain prompt (reusing existing dialog stack)
key_files:
  created:
    - lib/integrations/shopify/shop-domain.ts
    - tests/unit/shop-domain.test.ts
  modified:
    - components/onboarding/connect-step.tsx
    - app/app/settings/_connections.tsx
decisions:
  - normalizeShopDomain strips scheme+path before regex check so users can paste full URLs
  - Bare handle (no dot) gets .myshopify.com appended; dotted non-myshopify domains return null
  - Onboarding uses inline input (no modal) to match surrounding card layout
  - Settings uses Radix Dialog (consistent with existing disconnect dialog pattern)
  - autoFocus on dialog input; useRef+useEffect focus on inline reveal for keyboard accessibility
metrics:
  duration: "~8 minutes"
  completed: "2026-05-23T08:13:19Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-260523-1jq Plan 01: Fix Shopify Connect Button to Collect Store Domain Summary

**One-liner:** Client-safe shop domain normalizer + inline onboarding prompt + Settings Radix Dialog prompt so Shopify OAuth connect always redirects with a valid `?shop=` param.

## What Was Built

### Task 1: Shop-domain normalizer + onboarding inline prompt (TDD)

**lib/integrations/shopify/shop-domain.ts** — new client-safe module:
- Exports `SHOP_DOMAIN_RE = /^[a-z0-9-]+\.myshopify\.com$/` (mirrors server regex in client.ts)
- Exports `normalizeShopDomain(raw)`: trim → lowercase → strip scheme → strip path → auto-append `.myshopify.com` for bare handles → SHOP_DOMAIN_RE gate → return value or null
- No server/Node imports — safe for "use client" components

**tests/unit/shop-domain.test.ts** — 15 tests covering all plan behavior cases (TDD RED→GREEN)

**components/onboarding/connect-step.tsx** — updated:
- Shopify `kind`: clicking Connect reveals an inline domain input inside the Card (below status row) instead of redirecting
- Input: `data-testid="shopify-shop-input"`, `aria-label="Shopify store domain"`, `aria-invalid` on error, Enter-to-submit, `useRef+useEffect` focus on reveal
- Submit: `normalizeShopDomain` validates; null → `role="alert"` error; valid → `connectPath?shop=<domain>`
- Gmail `kind`: unchanged — direct `window.location.href = connectPath` on click

### Task 2: Settings Radix Dialog for Shopify (Task 2)

**app/app/settings/_connections.tsx** — updated:
- `ConnectionRow` gains `shopDialogOpen/shopInput/shopError` state
- `handleReconnect`: Shopify → opens Dialog; Gmail → direct redirect (unchanged)
- Dialog: `DialogTitle("Connect your Shopify store")`, `DialogDescription`, plain `<input>` with token-driven inline styles, `role="alert"` error paragraph
- Submit: same `normalizeShopDomain` validation → `connectPath?shop=<domain>` on success
- Cancel: `DialogClose` clears state
- Enter-to-submit via `onKeyDown`
- `autoFocus` on dialog input (Radix handles focus trapping + Escape-to-close)
- Disconnect confirm dialog (T-2-08-05) is a separate `<Dialog>` — completely unchanged
- All existing testids preserved: `connection-row-*`, `*-status-badge`, `reconnect-*`, `disconnect-*`, `confirm-disconnect-*`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED+GREEN) | 98e1e62 | feat(quick-260523-1jq-01): add shop-domain normalizer + inline Shopify domain prompt in onboarding |
| 2 | 4851b5b | feat(quick-260523-1jq-01): add Radix Dialog shop-domain prompt to Settings connections (Shopify only) |

## Verification Results

- `npx tsc --noEmit`: clean (0 errors)
- `npx vitest run`: 351 passed | 3 skipped | 12 todo (39 test files; +15 new shop-domain tests)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. This is a pure UI collection layer — no new network endpoints, auth paths, or schema changes. The redirect target (`/api/integrations/shopify/connect`) is an existing server route that already validates the `?shop=` param server-side (T-2-03-03 gate in `sanitizeShopDomain`).

## Self-Check: PASSED

- lib/integrations/shopify/shop-domain.ts: FOUND
- tests/unit/shop-domain.test.ts: FOUND
- components/onboarding/connect-step.tsx: FOUND (modified)
- app/app/settings/_connections.tsx: FOUND (modified)
- Commit 98e1e62: FOUND
- Commit 4851b5b: FOUND
