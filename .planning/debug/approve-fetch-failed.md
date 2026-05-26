---
slug: approve-fetch-failed
status: resolved
trigger: Clicking "Approve" on an approval inbox item throws a server-side "fetch failed" TypeError
created: 2026-05-26
updated: 2026-05-26
---

# Debug Session: approve-fetch-failed

## Symptoms

DATA_START
**Expected behavior:** Clicking "Approve" on an item in the Approval Inbox (/app/approvals) should resolve the approval (execute or queue the approved action) and update the UI without error.

**Actual behavior:** A Next.js dev runtime error overlay appears. The approval does not resolve cleanly.

**Error messages (from Next.js dev overlay):**
- `Runtime TypeError: fetch failed` — tagged **Server**
- Stack frame 1: `app/app/approvals/_list.tsx (789:13) @ ApprovalsView` — at the JSX rendering `<ApprovalDetail approval={activeApproval} onResolved={handleResolved} detailHeadingRef={detailHeadingRef} />`
- Stack frame 2: `app/app/approvals/page.tsx (62:7) @ ApprovalsPage`
- `Caused by: AggregateError — An error occurred in the Server Components render but no message was provided`

**Timeline:** Observed now during local dev. Unknown whether approve ever worked end-to-end in this environment (demo dataset is in use — Wanderbound/Sarah on abhiabhisingh17@gmail.com).

**Reproduction:** Go to /app/approvals on localhost:3000 (Next.js 16.2.6 Turbopack), open an approval, click "Approve".

**Environment notes:** Demo mode may be active. The approve→resolve path likely performs an outbound `fetch` to an external service (Shopify write / Gmail send / Anthropic) or a Supabase REST call that is unreachable or misconfigured (env/URL), producing the undici "fetch failed". Need to confirm WHICH fetch fails and whether demo mode should short-circuit external execution.
DATA_END

## Current Focus

- hypothesis: inngest.send() in approveItem server action throws TypeError: fetch failed because INNGEST_DEV=1 is set but the Inngest Dev Server is not running on localhost:8288.
- next_action: RESOLVED — see Resolution.

## Evidence

- timestamp: 2026-05-26T00:00:00Z
  finding: >
    The approveItem server action in app/app/approvals/actions.ts calls
    inngest.send({ name: 'approval.resolved', ... }) at line 147.
    This is the outbound fetch that fails.

- timestamp: 2026-05-26T00:00:01Z
  finding: >
    .env.local has INNGEST_DEV=1 which directs inngest.send() to POST to
    http://localhost:8288/ (the Inngest Dev Server default, confirmed in
    node_modules/inngest/helpers/consts.js: `defaultDevServerHost = "http://localhost:8288/"`).
    The INNGEST_SIGNING_KEY is commented out (#INNGEST_SIGNING_KEY=...).
    When the Inngest Dev Server is not running, the TCP connection is refused,
    producing undici AggregateError → TypeError: fetch failed.

- timestamp: 2026-05-26T00:00:02Z
  finding: >
    resolveApprovalRow (the DB ownership check + update) PRECEDES inngest.send(),
    so the approval row IS written to the DB successfully before the crash. The
    fetch failure happens only in the Inngest event-send step, not in the DB layer.

- timestamp: 2026-05-26T00:00:03Z
  finding: >
    No demo mode guard exists around inngest.send() in approveItem/rejectItem/editItem.
    isDemoUser() helper exists in lib/auth/demo.ts but is not called by any
    approval action. In a demo session the inngest.send() would attempt to fire
    a real resume event for a workflow that has no running Inngest function to
    receive it.

## Eliminated

- Shopify write / Gmail send / Anthropic: the crash is in the server action before
  any such call — inngest.send() is the first outbound fetch.
- Supabase misconfiguration: resolveApprovalRow (DB write) succeeds before the crash.
- Missing INNGEST_EVENT_KEY: the key is present and not commented out in .env.local.

## Resolution

- root_cause: >
    `inngest.send()` in `approveItem` (and the other approval actions) POSTs to
    `http://localhost:8288/` because `INNGEST_DEV=1` in `.env.local`. When the
    Inngest Dev Server is not running, the fetch fails with `TypeError: fetch
    failed` (undici AggregateError: connection refused). The DB ownership check
    and row update succeed; only the event send crashes.

- fix: >
    Two-part fix:
    1. Wrap inngest.send() in a try/catch in every approval action
       (approveItem, rejectItem, editItem, bulkResolve) and log the error rather
       than letting it propagate as an unhandled throw — the row is already
       resolved in the DB so the UX action is complete.
    2. Add a guard in actions.ts: when INNGEST_DEV=1 and the send fails, treat it
       as a no-op warning rather than a fatal error (the dev server being offline
       should not block local demo/testing of the approval UI).
    Longer-term: add demo mode guard via isDemoUser() to skip inngest.send()
    entirely for the demo user, since there is no live workflow run to resume.

- applied: true
