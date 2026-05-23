---
status: partial
phase: 04-polish-effortless-daily-use
source: [04-VERIFICATION.md]
started: 2026-05-22
updated: 2026-05-22
---

## Current Test

[awaiting human testing against a live stack]

## Tests

### 1. Apply pending live-DB migrations (deploy prerequisite)
expected: Migrations 0008 (user_exports UNIQUE(user_id)) and 0009 (user_sessions UNIQUE(supabase_session_id)) applied to the live database via `supabase db push` over the session pooler (port 5432). Without them: account export upsert throws, and session rows are never recorded (Sessions list stays empty).
result: [pending]

### 2. Sessions list populates and per-session revoke works (AUTH-04/05)
expected: After applying 0009 and signing in, the Settings → Sessions list shows the current session (device + approximate location + relative time). Revoke and "Sign out everywhere" behave per the UI copy.
result: [pending]

### 3. Account export end-to-end (SET-06)
expected: After applying 0008, triggering an export from Danger Zone produces a downloadable 24h signed URL from the PRIVATE user-exports bucket; re-triggering upserts rather than accumulating rows.
result: [pending]

### 4. APRV-05 — cross-surface Realtime badge decrement (<5s)
expected: Resolving an approval in one surface decrements the sidebar badge and updates the other surface within 5s (approvals-sync.spec.ts is currently test.fixme — verify manually or with a live Realtime stack).
result: [pending]

### 5. Phase 4 daily-use gate (mobile + a11y + keyboard + perf)
expected: At 375px — Approvals + Settings drill-down with no read-only stripping; axe-core zero violations on all 5 surfaces; A/R/E/S keyboard model with the textarea-typing guard; reduced-motion honored; perf targets per PRD §5.4.2. (e2e specs are HAS_LIVE_STACK-guarded; run `npx playwright test tests/e2e/{a11y,mobile,keyboard,perf}.spec.ts` with a live stack.)
result: [partial — approved by user during 04-06 gate; onboarding + build confirmed working]

## Summary

total: 5
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
