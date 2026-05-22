---
phase: 04-polish-effortless-daily-use
plan: "03"
subsystem: settings, brand-voice, memory, profile
tags: [settings, brand-voice, encryption, memory-crud, profile, notifications, server-actions, react-markdown, sonner]

# Dependency graph
requires:
  - phase: 04-01
    provides: memory.test.ts + settings.test.ts RED scaffolds, memory-items schema, brand-voice-profiles schema
  - phase: 02
    provides: lib/agent/memory.ts (storeMemoryItem/updateMemoryItem/softDeleteMemoryItem), lib/integrations/crypto.ts (encryptToken/decryptToken)
provides:
  - saveBrandVoice (encrypts via encryptToken), getBrandVoice (legacy-plaintext tolerant), regenerateBrandVoice (draft-only, T-4-03-04)
  - addMemoryItem/editMemoryItem/deleteMemoryItem/undoDeleteMemoryItem/getMemoryItems (ownership-bound, SET-04)
  - updateProfile/updateEmail/updatePassword (SET-05)
  - BrandVoiceSection (markdown editor + react-markdown preview + confirm-before-replace)
  - MemorySection (categorized list + inline edit/add + soft-delete + Sonner undo toast)
  - ProfileSection (name/avatar/email/password)
  - NotificationsSection (badge explainer + coming-soon, SET-08)
  - settings/page.tsx: parallel loads all 4 data sources, renders all 5 sections
affects: [04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "encryptToken before DB write + try-catch decryptToken fallback for legacy plaintext (A2/Pitfall 6)"
    - "regenerateBrandVoice returns { draft } only — no DB write (T-4-03-04 confirm-before-replace)"
    - "softDeleteMemoryItem + undoDeleteMemoryItem with Sonner undo toast 24h window (SET-04)"
    - "react-markdown without rehype-raw (T-4-03-03 XSS prevention, [02-06] convention)"
    - "useTransition + aria-busy + role=alert pattern for all client mutations"

key-files:
  created:
    - app/app/settings/_brand-voice.tsx
    - app/app/settings/_memory.tsx
    - app/app/settings/_profile.tsx
    - app/app/settings/_notifications.tsx
  modified:
    - app/app/settings/actions.ts
    - app/app/settings/page.tsx
    - tests/unit/settings.test.ts
    - tests/unit/memory.test.ts

key-decisions:
  - "[04-03] getBrandVoice wraps decryptToken in try-catch — legacy onboarding rows written as plaintext (A2) are returned raw when decryption fails; future saves encrypt going forward"
  - "[04-03] regenerateBrandVoice returns draft only (no DB write) — UI shows confirm-before-replace Dialog (T-4-03-04, SET-02 no silent overwrite)"
  - "[04-03] NotificationsSection has ZERO functional toggles — SET-08 explicitly scopes v1 to badge explainer + coming-soon placeholder only (NOTIF-01 deferred to v2)"
  - "[04-03] Button variant 'primary' does not exist in this codebase — corrected to 'default' per components/ui/button.tsx variants"

# Metrics
duration: ~65min
completed: 2026-05-22
---

# Phase 4 Plan 03: Settings Content Sections Summary

**Brand Voice (encrypt + regenerate-draft), Memory CRUD (soft-delete + undo toast), Profile (name/email/password/avatar), and Notifications placeholder — four end-to-end Settings sections with Server Actions, ownership checks, and encryption at rest**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-05-22T16:20:00Z
- **Completed:** 2026-05-22T16:35:00Z
- **Tasks:** 3 (all auto)
- **Files modified:** 8

## Accomplishments

- **`app/app/settings/actions.ts`** extended with 11 new Server Actions: `saveBrandVoice` (encryptToken before write, T-4-03-01), `getBrandVoice` (try-catch decryptToken + legacy-plaintext fallback, A2), `regenerateBrandVoice` (Claude draft only, T-4-03-04), `addMemoryItem`/`editMemoryItem`/`deleteMemoryItem`/`undoDeleteMemoryItem`/`getMemoryItems` (Zod enum guard T-4-03-05, ownership T-4-03-02), `updateProfile`/`updateEmail`/`updatePassword` (SET-05)
- **`_brand-voice.tsx`**: Two-column markdown editor + react-markdown preview (no rehype-raw, T-4-03-03); Save calls `saveBrandVoice`; Regenerate calls `regenerateBrandVoice` and loads draft into a confirm Dialog — no automatic overwrite
- **`_memory.tsx`**: Five-category memory list; inline add (per category), inline edit, soft-delete with 8s Sonner undo toast (calls `undoDeleteMemoryItem` to restore within 24h window)
- **`_profile.tsx`**: Three-subsection card — avatar preview + name/avatar URL form (`updateProfile`), email change with confirmation note (`updateEmail`), password change with confirm field (`updatePassword`)
- **`_notifications.tsx`**: Badge explainer (sidebar badge always-on, no settings) + "coming soon" chip for email/push (NOTIF-01) — zero functional toggles per SET-08
- **`page.tsx`**: Parallel-loads shopify health + gmail health + brand voice (plaintext-tolerant) + memory items; renders all 5 sections in order inside `max-w-[800px]` container
- **Tests**: `tests/unit/settings.test.ts` 4/4 green; `tests/unit/memory.test.ts` 3/3 green

## Task Commits

1. **Task 1: Server Actions (TDD)** — `dd44b56` (feat(04-03))
   - actions.ts: saveBrandVoice + getBrandVoice + regenerateBrandVoice + memory CRUD + profile actions
   - settings.test.ts: brand voice tests GREEN (4/4)
   - memory.test.ts: soft-delete + undo window tests GREEN (3/3)

2. **Task 2: Brand Voice + Memory components + page.tsx (partial)** — `588cad7` (feat(04-03))
   - _brand-voice.tsx: markdown editor + react-markdown preview + Save + Regenerate-confirm
   - _memory.tsx: categorized list + inline edit/add + soft-delete + Sonner undo toast
   - page.tsx: parallel loads + BrandVoiceSection + MemorySection

3. **Task 3: Profile + Notifications + page.tsx (complete)** — `aad98c9` (feat(04-03))
   - _profile.tsx: ProfileSection with name/avatar/email/password subsections
   - _notifications.tsx: NotificationsSection — badge explainer + coming-soon
   - page.tsx: all 5 sections rendered; typecheck clean

## Files Created/Modified

- `app/app/settings/actions.ts` — extended with 11 new exports (brand voice, memory CRUD, profile)
- `app/app/settings/_brand-voice.tsx` — BrandVoiceSection client component (340 lines)
- `app/app/settings/_memory.tsx` — MemorySection + CategoryCard + MemoryItemRow client components (340 lines)
- `app/app/settings/_profile.tsx` — ProfileSection + ProfileDetailsForm + EmailChangeForm + PasswordChangeForm (290 lines)
- `app/app/settings/_notifications.tsx` — NotificationsSection server-renderable (no client state)
- `app/app/settings/page.tsx` — extended with parallel data loads + 4 new sections
- `tests/unit/settings.test.ts` — brand voice tests turned GREEN (4 passing)
- `tests/unit/memory.test.ts` — soft-delete + undo window tests turned GREEN (3 passing)

## Decisions Made

- **Legacy-plaintext fallback (A2):** `getBrandVoice` wraps `decryptToken` in `try-catch`. Onboarding writes `profile_markdown` as plaintext (confirmed in `app/onboarding/actions.ts` L226-241). The fallback returns raw stored value on `decryptToken` failure. Future `saveBrandVoice` calls always encrypt.
- **regenerateBrandVoice draft-only (T-4-03-04):** Returns `{ draft }` from Claude, no DB write. The UI loads the draft into a confirm Dialog. User must click "Load draft" then explicitly "Save" — two deliberate actions before any persistence.
- **Button variant correction:** The `_connections.tsx` analog uses `variant="primary"` but the actual `components/ui/button.tsx` only has `default | secondary | ghost | danger | workflow`. Used `variant="default"` for primary-action buttons.
- **Notifications scope (SET-08):** Per plan and CONTEXT.md, v1 Notifications is badge explainer + coming-soon only. No toggles implemented. NOTIF-01 is explicitly deferred to v2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Button variant 'primary' does not exist**
- **Found during:** Task 2 typecheck
- **Issue:** Plan patterns referenced `variant="primary"` but `components/ui/button.tsx` only has `default | secondary | ghost | danger | workflow`
- **Fix:** Changed all `variant="primary"` to `variant="default"` in `_brand-voice.tsx` and `_memory.tsx`
- **Files modified:** `_brand-voice.tsx`, `_memory.tsx`
- **Commit:** `588cad7`

**2. [Rule 2 - Missing] Anthropic SDK mock needs class constructor**
- **Found during:** Task 1 test run
- **Issue:** `vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn()... }))` with arrow function doesn't work as a `new Anthropic()` constructor
- **Fix:** Changed mock to use `vi.fn().mockImplementation(function() {...})` — a proper function that works as a constructor
- **Files modified:** `tests/unit/settings.test.ts`
- **Commit:** `dd44b56`

**3. [Rule 2 - Missing] `undoDeleteMemoryItem` action needed for 24h undo**
- **Found during:** Task 1 implementation
- **Issue:** The plan specified a Sonner undo toast for memory delete but didn't explicitly call out `undoDeleteMemoryItem` as a separate action (only `deleteMemoryItem` was listed). The undo requires a restore path.
- **Fix:** Added `undoDeleteMemoryItem` server action that clears `soft_deleted_at`, and included it in `_memory.tsx` undo toast callback
- **Files modified:** `app/app/settings/actions.ts`, `app/app/settings/_memory.tsx`
- **Commit:** `dd44b56`

**4. [Rule 3 - Blocking] page.tsx split across two commits to avoid broken imports**
- **Found during:** Task 2 planning
- **Issue:** Task 2 commits page.tsx with BrandVoice + Memory sections; Task 3's `_profile` + `_notifications` don't exist yet. Including all 4 imports in Task 2's page.tsx would cause typecheck failure.
- **Fix:** Task 2 page.tsx includes only BrandVoiceSection + MemorySection imports. Task 3 re-writes page.tsx to add ProfileSection + NotificationsSection. Both compilations passed.
- **Files modified:** `app/app/settings/page.tsx` (two commits)
- **Commits:** `588cad7`, `aad98c9`

## Known Stubs

None. All sections render from real server-loaded data. The "coming soon" label in NotificationsSection is an intentional scope boundary (SET-08), not a data stub — there is no data to render for NOTIF-01 (deferred to v2).

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All T-4-03-0x mitigations applied:

| Flag | Applied | Location |
|------|---------|----------|
| T-4-03-01 | encryptToken before DB write in saveBrandVoice | actions.ts |
| T-4-03-02 | getValidatedClaims + userId from claims.sub + serviceDb user_id filter | all new actions |
| T-4-03-03 | react-markdown without rehype-raw (no raw HTML passthrough) | _brand-voice.tsx |
| T-4-03-04 | regenerateBrandVoice returns draft only; explicit Save required | actions.ts + _brand-voice.tsx |
| T-4-03-05 | Zod MemoryCategorySchema enum for category parameter | actions.ts |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `app/app/settings/_brand-voice.tsx` exists | FOUND |
| `app/app/settings/_memory.tsx` exists | FOUND |
| `app/app/settings/_profile.tsx` exists | FOUND |
| `app/app/settings/_notifications.tsx` exists | FOUND |
| `app/app/settings/actions.ts` exists | FOUND |
| Commit `dd44b56` (Task 1) | FOUND |
| Commit `588cad7` (Task 2) | FOUND |
| Commit `aad98c9` (Task 3) | FOUND |
| `saveBrandVoice` exported from actions.ts | FOUND |
| `encryptToken` called in actions.ts | FOUND |
| `regenerateBrandVoice` exported from actions.ts | FOUND |
| `BrandVoiceSection` in page.tsx | FOUND |
| `MemorySection` in page.tsx | FOUND |
| `ProfileSection` in page.tsx | FOUND |
| `NotificationsSection` in page.tsx | FOUND |
| `npx vitest run tests/unit/settings.test.ts` | 4/4 PASS |
| `npx vitest run tests/unit/memory.test.ts` | 3/3 PASS |
| `npm run typecheck` (source files) | 0 errors |
