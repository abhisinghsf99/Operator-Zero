---
phase: quick-260526-mfp
plan: "01"
subsystem: demo-seed
tags: [demo, gmail-mirror, seed, qa]
dependency_graph:
  requires: []
  provides: [gmail_threads seeded, gmail_messages seeded]
  affects: [lib/demo/seed.ts, gmail_threads table, gmail_messages table]
tech_stack:
  added: []
  patterns: [data-driven tuple loop, wipe-then-reinsert idempotency]
key_files:
  modified: [lib/demo/seed.ts]
decisions:
  - "Placed WIPE deletes for gmailMessages before gmailThreads (child → parent) consistent with existing convention"
  - "Escaped double-quote in subject 'Does the Voyager fit a 16\" laptop?' using backslash — valid in non-template string"
  - "Used async IIFE in throwaway runner to avoid top-level await CJS incompatibility with tsx"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26T23:14:03Z"
  tasks: 2
  files: 1
---

# Quick 260526-mfp Plan 01: Seed Gmail Mirror Demo Summary

## One-liner

Added 23 gmail_threads + 23 gmail_messages to `reseedDemo()` matching the demo narrative (9 product questions / 6 order-status / 5 newsletter / 3 spam), with aa12/bb34 approval-thread IDs wired verbatim.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add Gmail mirror imports + WIPE deletes + section 3.5 seed loop | c3072a7 | lib/demo/seed.ts |
| 2 | Populate live demo DB and verify counts | (no commit — /tmp runner only) | — |

## Live DB Verification

Counts for demo user after `reseedDemo()`:

| Table | Expected | Actual |
|-------|----------|--------|
| gmail_threads | 23 | **23** |
| gmail_messages | 23 | **23** |
| gmail_threads WHERE is_customer_support = true | 9 | **9** |

All three counts confirmed correct.

## TypeScript Check

`npx tsc --noEmit` — **zero errors** (strict mode).

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation was wrapping the /tmp runner in an async IIFE instead of using top-level await (tsx in CJS mode does not support top-level await; IIFE is semantically equivalent).

## Security / Threat Surface

- T-mfp-01 (mitigate): every gmailThreads/gmailMessages insert carries `user_id: USER` — cross-user write path is blocked by the DEMO_USER_ID guard at the top of `reseedDemo()`.
- T-mfp-02 (mitigate): throwaway scripts ran from /tmp and project scripts/ directory; both deleted before any git stage. `git diff --name-only` shows only `lib/demo/seed.ts`.

## Known Stubs

None — all 23 threads/messages are fully wired with realistic body text. The inbox tools (`gmail_list_threads`, `gmail_get_thread`) will now return populated data on every reseed.

## Self-Check: PASSED

- [x] lib/demo/seed.ts modified and committed (c3072a7)
- [x] gmailThreads + gmailMessages imported
- [x] WIPE deletes present for both gmail tables
- [x] Section 3.5 present with 23-entry tuple array
- [x] aa12/maria.g@example.com and bb34/devin.r@example.com match approvals §11 verbatim
- [x] npx tsc --noEmit: zero errors
- [x] Live DB counts: 23 / 23 / 9 — all correct
- [x] No /tmp or scripts/_tmp_* files committed
