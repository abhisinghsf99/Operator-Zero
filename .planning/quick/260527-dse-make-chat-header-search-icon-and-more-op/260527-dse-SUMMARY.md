---
phase: quick-260527-dse
plan: "01"
subsystem: chat
tags: [chat, search, thread-management, accessibility, pin, server-actions, migration]
dependency_graph:
  requires:
    - quick-260527-d97 (react-markdown block — guardrail preserved intact)
    - phase-02 thread schema (archived_at column already present)
  provides:
    - pinned_at on threads (migration 0010 — manual apply required)
    - deleteThread server action
    - togglePinThread server action
    - listThreads pinned-first ordering
    - ChatHeaderMenu (⋯ More popover)
    - ChatSearchBar (in-thread search)
  affects:
    - components/chat/message-stream.tsx (header wiring)
    - components/chat/thread-sidebar.tsx (pin indicator)
    - app/app/chat/[threadId]/page.tsx (props forwarding)
tech_stack:
  added: []
  patterns:
    - Atomic SQL CASE expression for togglePinThread (TOCTOU-safe pin flip)
    - Custom role=menu popover without npm dependency (hand-rolled a11y)
    - Message ref map (Map<id, HTMLDivElement>) for scroll-into-view
    - router.refresh() after mutations to trigger RSC re-fetch
key_files:
  created:
    - supabase/migrations/0010_threads_pinned_at.sql
    - components/chat/chat-header-menu.tsx
    - components/chat/chat-search-bar.tsx
  modified:
    - lib/db/schema/threads.ts
    - app/app/chat/actions.ts
    - components/design/icons.tsx
    - components/chat/thread-sidebar.tsx
    - components/chat/message-stream.tsx
    - app/app/chat/[threadId]/page.tsx
decisions:
  - "[260527-dse] togglePinThread uses atomic CASE expression (per plan checker) to avoid TOCTOU race; returns new pinned_at via RETURNING so client gets truth"
  - "[260527-dse] ChatHeaderMenu is hand-rolled (no popover npm dep) with role=menu, focus management, arrow-key nav, outside-click + Escape close — WCAG 2.1 AA"
  - "[260527-dse] router.refresh() called after rename, delete, pin — triggers RSC re-fetch of listThreads so sidebar pin ordering stays consistent without full reload"
  - "[260527-dse] ReactMarkdown block from 260527-d97 guardrail intact — no changes to markdown rendering pipeline (T-2-06-02 XSS guard preserved)"
  - "[260527-dse] Migration 0010 apply is OUT OF SCOPE — pin/unpin will silently no-op in prod until supabase db push is run over session pooler (port 5432)"
metrics:
  duration: "~40 minutes"
  completed: "2026-05-27"
  tasks: 6
  files: 8
---

# Phase quick-260527-dse Plan 01: Chat Header Search + ⋯ More Menu Summary

**One-liner:** Functional Search + More header buttons with in-thread message search (match nav, scroll, highlight) and an accessible popover menu (Rename, soft Delete, Copy transcript, Pin/Unpin) backed by two new server actions and a pinned_at migration.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Migration 0010 + pinned_at schema column | dc8671f | `supabase/migrations/0010_threads_pinned_at.sql`, `lib/db/schema/threads.ts` |
| 2 | deleteThread + togglePinThread actions; extend listThreads | df9e4e6 | `app/app/chat/actions.ts` |
| 3 | Pin icon + sidebar pin indicator | dd8606d | `components/design/icons.tsx`, `components/chat/thread-sidebar.tsx` |
| 4 | ChatHeaderMenu — custom accessible popover | 445b3bf | `components/chat/chat-header-menu.tsx` |
| 5 | ChatSearchBar — in-thread message search | 697b9b3 | `components/chat/chat-search-bar.tsx` |
| 6 | Wire Search + Menu into chat header | bb734b8 | `components/chat/message-stream.tsx`, `app/app/chat/[threadId]/page.tsx` |

## Deviations from Plan

### Auto-applied refinements (from plan checker, not deviations)

**1. Atomic pin toggle (plan checker refinement)**
- **Instruction:** Use a single `UPDATE ... SET pinned_at = CASE WHEN ... IS NULL THEN now() ELSE NULL END ... RETURNING` instead of read-then-write
- **Applied:** `togglePinThread` uses the CASE expression inside a single `withUserRls` call with `.returning({ pinned_at })` — eliminates TOCTOU race
- **File:** `app/app/chat/actions.ts`

**2. router.refresh() after mutations (plan checker refinement)**
- **Instruction:** Call `router.refresh()` after togglePinThread, deleteThread (navigate), renameThread so RSC re-fetches listThreads and sidebar updates
- **Applied:** `handlePin` and `handleRenameSave` in ChatHeaderMenu both call `router.refresh()` after success; deleteThread navigates via `router.push` which implicitly refreshes
- **File:** `components/chat/chat-header-menu.tsx`

None — plan executed exactly as written (plus the two plan-checker refinements above).

## TypeScript Check

`npx tsc --noEmit` — **CLEAN** (no errors, no warnings).

## Runtime Dependency Check

`git diff --stat package.json` — **EMPTY** (no new runtime dependency added). The ⋯ popover is hand-rolled; dialogs reuse the existing Radix-backed `components/ui/dialog.tsx`.

## HUMAN ACTION REQUIRED — Migration 0010

Pin/Unpin will silently fail in prod until migration 0010 is applied. Run:

```bash
supabase db push --db-url "$DATABASE_URL"
```

where `DATABASE_URL` points to the **session pooler on port 5432** (not the transaction pooler on 6543). Never use `supabase migration apply` via MCP — it lacks project-write permission for this project.

## Known Stubs

None — all four menu actions are fully wired to real server actions or browser APIs.

## Threat Flags

No new network endpoints, auth paths, or schema trust boundaries introduced beyond what is already covered by existing RLS policy (`threads_user_policy for: all` already covers UPDATE of `pinned_at` and `archived_at`).

## Self-Check: PASSED

- [x] `supabase/migrations/0010_threads_pinned_at.sql` — exists
- [x] `components/chat/chat-header-menu.tsx` — exists (459 lines)
- [x] `components/chat/chat-search-bar.tsx` — exists (258 lines)
- [x] Commits dc8671f, df9e4e6, dd8606d, 445b3bf, 697b9b3, bb734b8 — all present in git log
- [x] `npx tsc --noEmit` — clean
- [x] `git diff --stat package.json` — empty
- [x] `grep -q "ReactMarkdown" components/chat/message-stream.tsx` — present (T-2-06-02 guardrail intact)

## Post-verification fixes

**a11y (commit 5d7442c):** The verifier flagged a WARNING that the ⋯ More-options trigger announced as a toggle button rather than a menu button — `IconButton` only forwarded `aria-label` and rendered `aria-pressed` via its `active` prop, with no menu-button semantics.

Fixed via **Approach A**: extended `components/design/primitives.tsx` `IconButton` to accept optional `aria-haspopup` and `aria-expanded` props and forward them onto the underlying `<button>`. When `aria-haspopup` is set, `IconButton` now suppresses `aria-pressed` so the control no longer announces as a toggle. The `ChatHeaderMenu` ⋯ trigger passes `aria-haspopup="menu"` and `aria-expanded={open}`. The new props are optional, so the other `IconButton` callers (message-stream, workflow-row, _memory) are unaffected. Existing keyboard nav, Escape/outside-click close, focus management, and `role="menu"` on the popover are unchanged. `npx tsc --noEmit` clean.
