---
phase: 02-foundation-prove-the-agent
plan: "04"
subsystem: gmail-integration
tags: [gmail, oauth, sync, classification, inngest, token-refresh]
dependency_graph:
  requires: [02-02, 02-03]
  provides: [gmail-oauth-connect, gmail-token-refresh, gmail-initial-sync, gmail-incremental-sync, gmail-classification, gmail-inngest-functions]
  affects: [app/api/inngest/route.ts, lib/integrations/gmail/*, tests/unit/]
tech_stack:
  added:
    - googleapis: Gmail REST API + OAuth2Client (already in package.json)
    - google-auth-library: OAuth2Client for token exchange + refresh
  patterns:
    - Nonce-in-DB CSRF pattern (mirrors Shopify OAuth from 02-03)
    - Dual-token encryption (access + refresh via libsodium secretbox)
    - History API cursor pattern (last_history_id in gmail_sync_state)
    - Anthropic fast-path YES/NO classifier for email triage
key_files:
  created:
    - lib/integrations/gmail/client.ts
    - lib/integrations/gmail/sync.ts
    - lib/integrations/gmail/classify.ts
    - lib/inngest/functions/gmail-sync.ts
    - app/api/integrations/gmail/connect/route.ts
    - app/api/integrations/gmail/callback/route.ts
  modified:
    - app/api/inngest/route.ts
    - .env.local.example
    - tests/unit/gmail-oauth.test.ts
    - tests/unit/gmail-sync.test.ts
    - tests/unit/adapters.test.ts
decisions:
  - Gmail OAuth uses same nonce-in-DB CSRF pattern as Shopify (nonce: prefix in access_token_encrypted)
  - provider_account_id set to userId as placeholder on connect — actual Gmail email address not fetched (non-blocking for v1)
  - classifySupport uses claude-haiku-4-5 (faster/cheaper) not Opus — fast-path YES/NO needs low latency
  - historyId expiry (404/410) triggers full re-sync fallback rather than erroring
metrics:
  duration_minutes: 67
  completed_date: "2026-05-22"
  tasks_completed: 3
  files_changed: 11
requirements: [INTEG-04, INTEG-05]
---

# Phase 02 Plan 04: Gmail Integration Summary

Real Gmail OAuth with offline access, 30-day initial thread sync, History API incremental polling with cursor persistence, Anthropic fast-path support-email classification, transparent token refresh from encrypted refresh token.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 0 | Credential docs + .env.local.example | 5827beb | .env.local.example |
| 1 (RED) | Gmail OAuth failing tests | e186848 | tests/unit/gmail-oauth.test.ts |
| 1 (GREEN) | Gmail OAuth connect + callback + token refresh | a59c4cf | lib/integrations/gmail/client.ts, app/api/integrations/gmail/connect/route.ts, app/api/integrations/gmail/callback/route.ts, tests/unit/adapters.test.ts |
| 2 (RED) | Gmail sync failing tests | 039a656 | tests/unit/gmail-sync.test.ts |
| 2 (GREEN) | Gmail sync + classify + Inngest functions | 99d5aa2 | lib/integrations/gmail/sync.ts, lib/integrations/gmail/classify.ts, lib/inngest/functions/gmail-sync.ts, app/api/inngest/route.ts |

## What Was Built

**GmailAdapter (lib/integrations/gmail/client.ts)**
- `isHealthy()`: DB-row health check (status='active' and expires_at in future)
- `refreshToken()`: delegates to `getAccessToken()` — transparent refresh via OAuth2Client
- `getAccessToken(userId)`: loads integration row, detects expiry, decrypts refresh token, calls `client.refreshAccessToken()`, re-encrypts new access token, updates row, returns plaintext in memory only (T-2-04-02)
- `buildGmailAuthUrl(nonce, redirectUri)`: access_type=offline, prompt=consent, gmail.modify scope, state nonce (T-2-04-01)
- `exchangeGmailCode(userId, code, redirectUri)`: token exchange, encryptToken on both access+refresh, integrations UPSERT, fires gmail.connected event

**OAuth Routes**
- `GET /api/integrations/gmail/connect`: auth guard, nonce generation, pending integration row, redirect to Google consent
- `GET /api/integrations/gmail/callback`: state CSRF verify → code exchange → dual token encryption → UPSERT → fire gmail.connected → redirect /onboarding?step=3

**Gmail Sync (lib/integrations/gmail/sync.ts)**
- `gmailInitialSync(userId)`: cursor-paginated threads.list (newer_than:30d), UPSERT gmail_threads + gmail_messages, getProfile to capture last_history_id
- `gmailIncrementalSync(userId)`: history.list startHistoryId=last_history_id, messageAdded historyTypes, UPSERT new messages, advance cursor; historyId expiry (404/410) falls back to full re-sync
- `getActiveGmailUserIds()`: returns user IDs with active Gmail integrations for cron fan-out

**Classify (lib/integrations/gmail/classify.ts)**
- `classifySupport(subject, snippet)`: claude-haiku-4-5 YES/NO prompt, email content as data (T-2-04-03), returns boolean

**Inngest Functions (lib/inngest/functions/gmail-sync.ts)**
- `gmailInitialSyncFn`: triggered by gmail.connected, concurrency key userId, retries=3
- `gmailIncrementalPollFn`: cron */5 * * * *, fan-out per active user, retries=1
- Both registered in app/api/inngest/route.ts serve()

## Deviations from Plan

### Cross-Plan Test Maintenance (Required Fix)

**[Rule 1 - Bug] Updated adapters.test.ts for Phase 2 GmailAdapter**
- **Found during:** Task 1 implementation
- **Issue:** The existing `GmailAdapter (Phase 1 skeleton — until 02-04)` describe block asserted `isHealthy() resolves to false` and `refreshToken() rejects with 'Not implemented until Phase 2'` — both assertions became stale after implementing the real adapter
- **Fix:** Replaced the describe block with `GmailAdapter (Phase 2 — real, DB mocked)` mirroring the existing ShopifyAdapter pattern. Added mocks for google-auth-library, googleapis, inngest, and crypto. New assertions: isHealthy checks status + expires_at; refreshToken delegates to OAuth2Client.refreshAccessToken; missing refresh token rejects with descriptive error
- **Files modified:** tests/unit/adapters.test.ts
- **Commit:** a59c4cf

### Test Mock Fix (Rule 1)

**[Rule 1 - Bug] Fixed insert mock key ordering in gmail-sync.test.ts**
- **Found during:** Task 2 GREEN phase
- **Issue:** The mock's `insert().values()` handler checked `"gmail_thread_id" in val` before `"gmail_message_id" in val`. Since message rows contain both keys (gmail_message_id + gmail_thread_id FK), messages were being pushed to upsertedThreads instead of upsertedMessages
- **Fix:** Reversed check order — `gmail_message_id` checked first (thread rows do not have this key)
- **Files modified:** tests/unit/gmail-sync.test.ts
- **Commit:** 99d5aa2

## Human Action Required (end-of-phase)

Gmail OAuth credentials were NOT provisioned (Task 0 deferred per orchestrator directive). Live OAuth + sync testing requires these steps:

1. **Enable Gmail API**: Google Cloud Console → APIs & Services → Library → Enable "Gmail API"
2. **Configure OAuth consent screen**: Add scope `https://www.googleapis.com/auth/gmail.modify`; add your email as a test user
3. **Create OAuth 2.0 Web Client**: APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID (Web application)
4. **Set Authorized redirect URIs**:
   - `https://your-app.vercel.app/api/integrations/gmail/callback`
   - `http://localhost:3000/api/integrations/gmail/callback` (local dev)
5. **Set env vars** (add to .env.local AND Vercel env):
   ```
   GOOGLE_CLIENT_ID=<from step 3>
   GOOGLE_CLIENT_SECRET=<from step 3>
   ```
   Note: These are DIFFERENT from Supabase's Google OAuth credentials. Supabase handles login; these handle gmail.modify inbox access.

After setting credentials: test by visiting `/api/integrations/gmail/connect`, completing OAuth consent, and verifying `gmail_threads` is populated in the DB with `last_history_id` set in `gmail_sync_state`.

## Threat Surface Scan

No new threat surface beyond what was declared in the plan's threat model. All four registered threats (T-2-04-01 through T-2-04-04) were mitigated:
- T-2-04-01: state nonce verified in callback before token exchange
- T-2-04-02: encryptToken on both access + refresh tokens before DB write
- T-2-04-03: classifySupport uses YES/NO-only prompt; email body is user-turn data
- T-2-04-04: all serviceDb queries filter by user_id

## Known Stubs

**provider_account_id = userId on connect** (lib/integrations/gmail/client.ts:99)
- Reason: Gmail account email address is available from the profile endpoint, but fetching it adds a round-trip inside the callback. For v1, userId serves as a functional placeholder.
- Impact: Non-blocking — the field is nullable in the schema and not used in any downstream query.
- Resolution: A future plan can call `gmail.users.getProfile({ userId: 'me' })` in `exchangeGmailCode` and set `provider_account_id: profile.emailAddress`.

## Self-Check: PASSED

All 10 target files exist. All 5 task commits verified in git log. Full test suite: 16 files passed, 0 failed. npx tsc --noEmit: clean.
