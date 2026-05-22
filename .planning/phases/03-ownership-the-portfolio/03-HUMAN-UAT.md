---
status: partial
phase: 03-ownership-the-portfolio
source: [03-VERIFICATION.md]
started: "2026-05-22T12:15:00Z"
updated: "2026-05-22T12:15:00Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Activity log p50 performance under load
expected: With 1,000+ activity entries seeded, /app/activity loads and shows the first 50 rows in under 1 second (p50); scrolling to the bottom triggers cursor pagination that loads the next page in under 1 second. (SC-3 / ACT-07)
result: [pending]

### 2. My Workflows usage metrics (SC-1 + SC-2)
expected: Median user has 5+ active workflows visible in My Workflows (grouped by status with inline L1/L2/L3 toggle); 60% of users visit My Workflows 3x/week. Structural capability verified (D-16 redirect live, grouped default landing); metric needs production analytics over week 4.
result: [pending]

### 3. Realtime recent-activity strip updates live cross-tab
expected: With My Workflows open in two browser tabs, inserting an activity entry refreshes the Recent Activity strip counts in the other tab within seconds, no page reload. Depends on Supabase Realtime broker + migration 0005 RLS policies (activity:/approvals-strip: channels, now applied live).
result: [pending]

### 4. Run Now appears live in Historical Runs
expected: Clicking Run Now on a Workflow Detail page makes the run row appear at the top of Historical Runs within seconds, no refresh. Requires the live Inngest worker to process `workflow.run_requested` and write a workflow_runs row, then the runs:<workflowId> Realtime broadcast.
result: [pending]

### 5. Blocked-revert tooltip accessibility
expected: A disabled (blocked) revert button is keyboard-focusable and its tooltip explanation is announced by a screen reader via aria-describedby (WCAG 2.1 AA 4.1.2). Requires manual AT testing.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
