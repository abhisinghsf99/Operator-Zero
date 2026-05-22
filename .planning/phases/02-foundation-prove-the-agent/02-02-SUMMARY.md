---
phase: 02-foundation-prove-the-agent
plan: 02
subsystem: database-schema
tags: [schema, migration, pgvector, rls, test-scaffolds, supabase]
dependency_graph:
  requires: [02-01]
  provides: [schema-22-tables, migration-0003-applied, wave-0-test-scaffolds]
  affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08]
tech_stack:
  added:
    - drizzle-orm vector column (pgvector integration)
  patterns:
    - composite-PK mirror tables (shopify/gmail)
    - user_id-as-PK singleton tables (brand_voice_profiles, autonomy_thresholds, sync states)
    - HNSW vector index via Drizzle index().using("hnsw", col.op("vector_cosine_ops"))
    - partial unique index for idempotency (activity_entries workflow_run_id + step_id)
key_files:
  created:
    - lib/db/schema/workflows.ts
    - lib/db/schema/workflow-versions.ts
    - lib/db/schema/workflow-runs.ts
    - lib/db/schema/activity-entries.ts
    - lib/db/schema/approvals.ts
    - lib/db/schema/threads.ts
    - lib/db/schema/messages.ts
    - lib/db/schema/memory-items.ts
    - lib/db/schema/memory-embeddings.ts
    - lib/db/schema/brand-voice.ts
    - lib/db/schema/autonomy-thresholds.ts
    - lib/db/schema/shopify-mirror.ts
    - lib/db/schema/gmail-mirror.ts
    - lib/db/schema/telemetry.ts
    - supabase/migrations/0003_phase2_tables.sql
    - tests/unit/shopify-oauth.test.ts
    - tests/unit/shopify-sync.test.ts
    - tests/unit/shopify-webhook.test.ts
    - tests/unit/shopify-mutations.test.ts
    - tests/unit/gmail-oauth.test.ts
    - tests/unit/gmail-sync.test.ts
    - tests/unit/integration-health.test.ts
    - tests/unit/cost-cap.test.ts
    - tests/unit/prompt-builder.test.ts
    - tests/unit/tool-validation.test.ts
    - tests/unit/agent-memory.test.ts
    - tests/unit/agent-errors.test.ts
    - tests/unit/catalog-audit.test.ts
    - tests/unit/onboarding-progress.test.ts
    - tests/unit/workflow-engine.test.ts
    - tests/unit/l2-approval-flow.test.ts
    - tests/integration/chat-stream.test.ts
    - tests/e2e/settings-connections.spec.ts
    - tests/e2e/full-workflow-journey.spec.ts
  modified:
    - lib/db/schema/index.ts (re-exports all 22 new tables)
    - lib/db/schema/users.ts (added onboarding_step column)
decisions:
  - "[02-02] vector(1024) confirmed for voyage-4 — DATA-FLOW.md draft says 1536 but embeddings.ts and RESEARCH.md both confirm 1024; 1024 used everywhere"
  - "[02-02] workflow_versions has no direct RLS policy — access is gated via workflows FK (ON DELETE CASCADE); agent-tier code must still filter by user_id"
  - "[02-02] activity_entries.unique(workflow_run_id, step_id) is a PARTIAL index (WHERE both are NOT NULL) — direct chat actions have null workflow_run_id and are excluded from the constraint"
  - "[02-02] deferred FK for workflows.current_version_id → workflow_versions (circular dependency) — DEFERRABLE INITIALLY DEFERRED in migration"
metrics:
  duration: "~18 minutes"
  completed: "2026-05-22"
  tasks_completed: 4
  files_created: 35
  files_modified: 2
---

# Phase 02 Plan 02: Schema Migration + Wave-0 Test Scaffolds Summary

All Phase 2 Drizzle schema files authored, migration 0003 applied to live Supabase DB, and 19 Wave-0 test scaffolds created. Plans 03-08 are now unblocked.

## What Was Built

### Task 0: Voyage embedding dimension confirmed + Wave-0 test scaffolds

**Voyage dimension confirmed: 1024**

The `lib/agent/embeddings.ts` file has explicit comments confirming voyage-4 outputs 1024 dimensions (RESEARCH.md finding #2 / Pitfall 3 — DATA-FLOW.md draft incorrectly says 1536, but the live code uses 1024).

19 Wave-0 test files created as `it.todo` scaffolds:
- 16 unit tests (tests/unit/)
- 1 integration test (tests/integration/chat-stream.test.ts)
- 2 e2e Playwright specs (tests/e2e/)

All files parsed by `npx vitest run` without import errors. Downstream plans have real file paths to attach as `<automated>` verification targets.

### Task 1: 22 Phase 2 Drizzle schema files

14 new schema files covering all 22 tables from DATA-FLOW.md §3-8:

| File | Tables |
|------|--------|
| workflows.ts | workflows |
| workflow-versions.ts | workflow_versions |
| workflow-runs.ts | workflow_runs |
| activity-entries.ts | activity_entries |
| approvals.ts | approvals |
| threads.ts | threads |
| messages.ts | messages |
| memory-items.ts | memory_items |
| memory-embeddings.ts | memory_embeddings |
| brand-voice.ts | brand_voice_profiles, brand_voice_samples |
| autonomy-thresholds.ts | autonomy_thresholds |
| shopify-mirror.ts | shopify_products, shopify_product_variants, shopify_orders, shopify_pages, shopify_redirects, shopify_sync_state |
| gmail-mirror.ts | gmail_threads, gmail_messages, gmail_sync_state |
| telemetry.ts | agent_telemetry, cost_aggregates |

Every user-data table has:
- `user_id uuid NOT NULL` (tenant discriminator)
- `pgPolicy` using `(SELECT auth.uid()) = user_id`
- `.enableRLS()`
- `index("idx_<table>_user_id")` or composite btree index

`memory_embeddings` and `brand_voice_samples` use `vector("embedding", { dimensions: 1024 })` + HNSW index.

`lib/db/schema/users.ts` extended with `onboarding_step: integer` (ONBOARD-06).

`lib/db/schema/index.ts` re-exports all 22 new tables by name.

`npx tsc --noEmit` passes with zero errors.

### Task 2: Migration 0003_phase2_tables.sql

Complete forward-only migration authored at `supabase/migrations/0003_phase2_tables.sql`:

- `CREATE EXTENSION IF NOT EXISTS vector;` as first statement
- 23 `CREATE TABLE IF NOT EXISTS` statements (22 with RLS, workflow_versions inherits via FK)
- 22 `ENABLE ROW LEVEL SECURITY` + corresponding `_user_policy` policies
- `update_updated_at_column()` trigger reused from 0002 (NOT redefined): applied to workflows, memory_items, brand_voice_profiles, autonomy_thresholds
- CHECK constraints: automation_level ('L1','L2','L3'), workflows.status ('active','paused','draft','archived'), workflow_runs.status (7 states), approvals.status (5 states)
- HNSW indexes on memory_embeddings.embedding and brand_voice_samples.embedding (m=16, ef_construction=64, vector_cosine_ops)
- Partial unique index on activity_entries(workflow_run_id, step_id) WHERE both NOT NULL (WF-06 idempotency)
- Deferred FK: workflows.current_version_id → workflow_versions.id (circular dep resolution)
- `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0`

### Task 3: Migration applied to live Supabase DB

Migration 0003 applied via `npx supabase db push --password "$SUPABASE_DB_PASSWORD"`.

**Verification — all 23 tables confirmed present:**

| Table | Status |
|-------|--------|
| workflows | PASS (HTTP 200) |
| workflow_versions | PASS (HTTP 200) |
| workflow_runs | PASS (HTTP 200) |
| activity_entries | PASS (HTTP 200) |
| approvals | PASS (HTTP 200) |
| threads | PASS (HTTP 200) |
| messages | PASS (HTTP 200) |
| memory_items | PASS (HTTP 200) |
| memory_embeddings | PASS (HTTP 200) |
| brand_voice_profiles | PASS (HTTP 200) |
| brand_voice_samples | PASS (HTTP 200) |
| autonomy_thresholds | PASS (HTTP 200) |
| shopify_products | PASS (HTTP 200) |
| shopify_product_variants | PASS (HTTP 200) |
| shopify_orders | PASS (HTTP 200) |
| shopify_pages | PASS (HTTP 200) |
| shopify_redirects | PASS (HTTP 200) |
| shopify_sync_state | PASS (HTTP 200) |
| gmail_threads | PASS (HTTP 200) |
| gmail_messages | PASS (HTTP 200) |
| gmail_sync_state | PASS (HTTP 200) |
| agent_telemetry | PASS (HTTP 200) |
| cost_aggregates | PASS (HTTP 200) |

**user_profiles.onboarding_step column:** PASS (HTTP 200 on SELECT)

**Migration health check:** `npx supabase db push --dry-run` confirms "Remote database is up to date."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DATA-FLOW.md vector dimension corrected to 1024**
- **Found during:** Task 0 (embedding dimension confirmation)
- **Issue:** DATA-FLOW.md §4.4 says `vector(1536)` for memory_embeddings, which is incorrect for voyage-4
- **Fix:** Used 1024 everywhere (embeddings.ts, memory-embeddings.ts, brand-voice.ts, migration 0003) per the existing embeddings.ts code which explicitly documents "voyage-4 defaults to 1024 dimensions"
- **Files modified:** All vector-related files created in this plan
- **Not a separate commit** — no pre-existing code used 1536; this was a research document error only

**2. [Rule 2 - Missing Critical] Added partial unique index for activity_entries idempotency**
- **Found during:** Task 2 review against threat model T-2-02-02
- **Issue:** Plan specified `unique(workflow_run_id, step_id)` but a standard UNIQUE constraint would fail for null-value rows (direct chat actions have null workflow_run_id)
- **Fix:** Used a `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE workflow_run_id IS NOT NULL AND step_id IS NOT NULL` partial index — semantically correct and correctly enforces idempotency only for workflow-originated entries

**3. [Rule 1 - Bug] workflow_versions FK circular dependency resolved**
- **Found during:** Task 2
- **Issue:** workflows.current_version_id → workflow_versions(id) creates a circular dependency (workflows → workflow_versions → workflows)
- **Fix:** Made the FK DEFERRABLE INITIALLY DEFERRED in migration SQL; added after workflow_versions table is created

## Known Stubs

None — this plan is a schema/migration plan. No data is rendered to UI.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | lib/db/schema/memory-embeddings.ts | HNSW queries without user_id filter would return cross-user embeddings — documented in schema comments; downstream code must filter |
| threat_flag: information_disclosure | lib/db/schema/workflow-versions.ts | No direct RLS — depends on workflows FK for isolation; agent-tier code must explicitly filter by user_id |

## Self-Check: PASSED

- [x] All 19 Wave-0 test files exist
- [x] All 14 schema files exist
- [x] migration 0003 file exists at supabase/migrations/
- [x] Commits exist: b84ca0d (Task 0), dff2fde (Task 1), ebf30e6 (Task 2)
- [x] `npx tsc --noEmit` passes
- [x] `npx vitest run` passes (26 files, 157 todo, 61 pass)
- [x] 23/23 tables confirmed in live DB via HTTP 200 checks
- [x] user_profiles.onboarding_step confirmed present
- [x] `npx supabase db push --dry-run` confirms "up to date"
