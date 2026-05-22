# Phase 03: Ownership — The Portfolio - Research

**Researched:** 2026-05-22
**Domain:** Next.js 15 App Router surfaces, Supabase Realtime, versioned-mutation Server Actions, canRevert drift logic, cursor-based pagination with Postgres indexes, Inngest workflow triggering
**Confidence:** HIGH (architecture confirmed from canonical docs + live codebase inspection) / MEDIUM (Realtime channel pattern for new tables needs first-write test; virtualization lib selection confirmed via npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Workflow Detail — editing**
- D-01: Name & description use click-to-edit inline (click → editable field → blur/Enter saves). No modal/drawer.
- D-02: Schedule editing uses a lightweight structured picker (frequency + time-of-day). Sarah never writes cron.
- D-03: Each inline edit (name/description/schedule/level) increments the workflow version (WF-14).

**Workflow Detail — versioning & runs**
- D-04: Compact "Version history" panel on Workflow Detail listing last 10 versions; Restore creates a new version (does not overwrite history).
- D-05: "Run Now" confirms for write/L3 workflows and runs instantly for read-only/manual. Triggered run appears in Historical Runs within seconds.
- D-06: "Open in Chat" opens a scoped Conversation thread pre-loaded with the workflow's context.

**Activity — revert, drift & bulk**
- D-07: Multi-select uses a "Select" mode toggle in the Activity header → reveals row checkboxes + bulk-action bar. Works on touch.
- D-08: Bulk revert is atomic (all-or-none); confirmation modal splits revertable vs blocked with reasons.
- D-09: Disabled reverts render as disabled button + accessible tooltip explaining why.
- D-10: "Save as Workflow" opens a scoped Conversation thread pre-loaded with the action's context.
- D-11: canRevert(activityEntry) is a shared function used by both UI and Server Action. Drift windows: content=7d, structural=24h, sent=never; "manually edited since" blocks revert.

**Activity — filters & detail**
- D-12: Filter UI = quick level/result chips + "Filter" popover (workflow + date-range + result); all combine with AND; active filters render as removable pills.
- D-13: Date-range filter = presets (Today / 7d / 30d / All time) + custom from-to picker.
- D-14: Activity detail renders before→after as readable field-level diff from before_state/after_state JSONB, alongside reasoning chain.

**My Workflows — landing & strip**
- D-15: All three recent-activity strip stats are real in v1: "Decisions outstanding" = live pending-approvals count; "Ran while you slept" = L3 actions in last 12h; "Time saved this week" = per-action-type heuristic (fixed minutes × action count) shown with "estimated" label.
- D-16: My Workflows is the default landing surface. Bare /app and /app/home redirect to /app/workflows. Keep /app/home as thin redirect.
- D-17: "Find a workflow" search = client-side fuzzy filter over the loaded list (name/description/domain).

### Claude's Discretion
- Data-fetching mechanism (Server Components + initial fetch vs. client query) and Realtime vs. poll for live updates ("Run Now appears in seconds", strip/approvals counts, activity stream).
- Pagination / virtualization strategy to hit ACT-07 (<1s p50 with 1,000+ entries) — cursor-based infinite scroll, page size, indexes.
- Exact before_state/after_state diff rendering per target_type (product vs. email vs. page).
- Whether reasoning_chain is read inline vs. fetched from reasoning_chain_url blob.
- The precise "time saved" minutes-per-action-type constants (a labeled estimate; tune from real data later).

### Deferred Ideas (OUT OF SCOPE)
- Approval Inbox + full inline approval cards — Phase 4.
- Full Settings (Brand Voice editor, Autonomy Thresholds, "What I Remember", Profile, Sessions, Export/Delete) — Phase 4.
- Mobile detailed-design pass + WCAG 2.1 AA hardening — Phase 4.
- Global search across surfaces — v2.
- Server-side / large-scale workflow search — v2.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WF-07 | My Workflows shows all workflows grouped by status with recent-activity strip | RSC initial fetch pattern; Realtime for strip counts; design file fully specifies layout |
| WF-08 | User can change automation level inline (L1/L2/L3) with immediate save; L3 one-time confirm | Server Action `editWorkflow` increments version (D-03); L3 confirm dialog pattern |
| WF-09 | User can pause/resume a workflow without deleting it | status field toggle ('active'→'paused') via Server Action; D-03 version increment applies |
| WF-10 | User can start a new workflow from My Workflows ("+ New Workflow" → Conversation thread) | Existing chat path; new thread creation with no context_workflow_id |
| WF-11 | Workflow Detail shows definition + historical runs; inline-editable name/desc/schedule/level | click-to-edit pattern; schedule picker; version increment per edit (D-01/D-02/D-03) |
| WF-12 | "Open in Chat" — scoped Conversation thread pre-loaded with workflow context | New thread with context_workflow_id set; redirect to /app/chat/[threadId] |
| WF-13 | "Run Now" triggers immediate execution; run appears in Historical Runs within seconds | inngest.send('workflow.run_requested'); Realtime subscription on workflow_runs by workflow_id |
| WF-14 | Workflows are versioned; runs reference their version; restore creates new version; last 10 retained | workflow_versions INSERT + workflows.current_version_id UPDATE in one transaction |
| ACT-01 | Activity log lists all agent actions chronologically with timestamp, workflow, summary, result, level | cursor-paginated query on activity_entries(user_id, occurred_at DESC); page size 50 |
| ACT-02 | User can filter by workflow, date range, result type, automation level (AND combine) | Drizzle .where() with dynamic AND clauses; debounce filter changes |
| ACT-03 | Activity detail shows full breakdown, before/after state, reasoning chain, link to parent workflow | field-level diff renderer per target_type; inline reasoning_chain vs. blob URL |
| ACT-04 | User can revert a recent change subject to drift rules; disabled reverts show tooltip why | canRevert() shared function; Server Action enforces; Tooltip with aria-describedby |
| ACT-05 | User can multi-select and bulk-revert atomically (all-or-none) | Drizzle transaction; Select mode UI (D-07/D-08) |
| ACT-06 | User can promote a one-off action into a saved workflow ("Save as Workflow") | Open scoped Conversation thread with action context pre-loaded (D-10) |
| ACT-07 | Activity log loads <1s p50 with 1000+ entries; 6-month retention | Cursor pagination + composite index; @tanstack/react-virtual for render |
| ACT-08 | Drift rules enforced consistently in UI and backend | Shared canRevert() in lib/workflows/revert.ts |

</phase_requirements>

---

## Summary

Phase 3 is a surface-delivery phase — the data model already exists (Phase 2), so the work is: (1) three new App Router routes, (2) inline editing with version-tracking Server Actions, (3) the `canRevert()` drift function + revert/bulk-revert, (4) "Run Now" Inngest trigger wiring, and (5) Realtime subscriptions for live counts and run appearance. There is no new Drizzle schema migration unless Activity performance analysis reveals missing compound indexes (it does — see below).

The architecture follows the established pattern from Phase 2: RSC + initial data fetch for first paint, thin client islands for interactive mutations, Server Actions for all writes, Supabase Realtime for push updates. The only new library needed is `@tanstack/react-virtual` for Activity log virtualization (all other dependencies are already installed).

The three most technically nuanced areas are: (1) versioning on every inline edit — a transaction that INSERTs into `workflow_versions` and UPDATEs `workflows.current_version_id` atomically, with a cleanup step to enforce the 10-version retention ceiling; (2) the `canRevert()` drift function — the "manually edited since" check requires querying `shopify_products.shopify_updated_at > E.occurred_at` for product targets, and this must be the same implementation in both the UI read path and the Server Action write path; and (3) Activity performance — the existing `idx_activity_user_time(user_id, occurred_at DESC)` index is insufficient for filtered queries because all five filter dimensions (workflow_id, date range, result, automation_level) combine with AND and none of them appear in that index.

**Primary recommendation:** Build as three vertical surface slices in dependency order: My Workflows (read-heavy, Realtime for strip) → Workflow Detail (inline edit + versioning + Run Now) → Activity (pagination + canRevert + bulk revert). Each slice is independently deployable. Add the Activity compound index migration before writing the Activity surface.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| My Workflows initial render | Frontend Server (RSC) | — | Server Component fetches workflows + strip stats in parallel; no client JS for first paint |
| Recent-activity strip (live counts) | Browser + Realtime | Database | Pending approvals count and "ran while slept" count change infrequently — Realtime postgres_changes on activity_entries and approvals suitable |
| Workflow list fuzzy search | Browser | — | Client-side filter over a small list (5–20); no server round-trip (D-17) |
| Inline level/pause/resume toggle | Browser + Server Action | Database | Optimistic UI in client; Server Action commits version increment |
| Workflow Detail initial render | Frontend Server (RSC) | — | RSC fetches workflow + versions + runs; static for first paint |
| Historical runs live update (Run Now) | Browser + Realtime | Database | After "Run Now", UI subscribes to workflow_runs for this workflow_id to show new run within seconds |
| Inline name/description edit | Browser + Server Action | Database | click-to-edit pattern; Server Action wraps version INSERT + workflow UPDATE in transaction |
| Schedule picker edit | Browser + Server Action | Database | Structured picker produces trigger_config JSONB; same version transaction |
| Version history panel | Frontend Server (RSC) | — | Last 10 versions fetched with workflow; no live update needed |
| Restore version | Browser + Server Action | Database | Server Action INSERTs new version forward (does not mutate old rows) |
| Run Now trigger | Browser + Server Action | Agent tier (Inngest) | Server Action calls inngest.send('workflow.run_requested') then subscribes; Realtime shows run |
| Activity log initial render | Frontend Server (RSC) | — | RSC fetches page 1 (50 entries) cursor-paginated |
| Activity log infinite scroll | Browser | Database (via Server Action/fetch) | Client requests next cursor; virtualization renders visible rows |
| Activity filters | Browser + Server Action | Database | Filter state in URL search params; Server Component re-fetches on filter change |
| Activity detail panel | Browser | — | Selected entry already in client state; no extra fetch for inline chain |
| Reasoning chain blob fetch | Browser | Supabase Storage | Only when reasoning_chain IS NULL and reasoning_chain_url IS NOT NULL — rare path |
| canRevert() drift check (UI) | Browser | — | Pure function over already-loaded entry fields + shopify_products timestamp (pre-fetched) |
| canRevert() drift check (Server Action) | API (Server Action) | Database | Re-reads shopify_updated_at inside the Server Action before writing |
| Single revert execution | API (Server Action) | Database + External APIs | revertActivity: read before_state, call Shopify/Gmail adapter, write revert_* entry, mark reverted_at |
| Bulk revert (atomic) | API (Server Action) | Database | Drizzle transaction wrapping all revert operations; all-or-none |
| "Save as Workflow" | Browser + Server Action | — | Create new thread with context; redirect; no new workflow row until user confirms in chat |
| Default landing redirect | Frontend Server (middleware) | — | middleware.ts: /app → /app/workflows; /app/home → /app/workflows |

---

## Standard Stack

### Core (already installed — no new installs for most surfaces)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 | App Router, RSC, Server Actions, middleware | Locked |
| `drizzle-orm` | 0.45.2 | Typed Postgres queries, transactions | Locked |
| `@supabase/ssr` | 0.10.3 | Realtime subscriptions, server auth | Locked |
| `zod` | ^3.24.0 | Server Action input validation | Locked |
| `framer-motion` | ^12.40.0 | Activity row enter animations, version history expand | Locked |
| `sonner` | ^2.0.7 | Toast: "Saved", "Reverted", "Running..." | Locked |
| `inngest` | 4.4.0 | Trigger workflow.run_requested event from Server Action | Locked |
| `zustand` | ^5.0.13 | Activity filter state, select-mode state (transient, not URL-serializable) | Locked |

### New Install Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-virtual` | 3.13.25 | Virtualize Activity log rows; render only visible rows in a 1000+ entry list | [VERIFIED: npm registry] Industry standard for React virtualization; works with Framer Motion (motion/react) for enter animations; no conflict with existing stack; does NOT require removing Framer Motion |

**Installation:**
```bash
npm install @tanstack/react-virtual
```

**Version verification:**
```bash
npm view @tanstack/react-virtual version  # 3.13.25 as of 2026-05-22
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@tanstack/react-virtual` | CSS overflow + browser scroll | Works at 1000 rows but DOM size causes layout thrash; fails p50 target at 2000+ entries |
| `@tanstack/react-virtual` | `react-window` | react-window is no longer actively maintained; @tanstack/react-virtual is the successor |
| Realtime for strip counts | Polling every 5s | Polling adds latency and request overhead; Realtime pushes instantly and reuses existing Phase 2 infrastructure |
| Drizzle transaction for bulk revert | Multiple sequential Server Actions | Not atomic; one external API failure leaves half-reverted state |

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. Verification performed via `npm view` on each package.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@tanstack/react-virtual` | npm | 6+ yrs (as @tanstack family) | Millions/wk | github.com/TanStack/virtual | Not run | Approved — official TanStack org, successor to react-virtual |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable. `@tanstack/react-virtual` is tagged `[ASSUMED]` for official-org verification. Planner should verify the exact package name before install.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Islands)
  │
  ├── /app/workflows (RSC shell)
  │     Initial fetch: workflows × approvals count × recent 5 activity entries
  │         ↓
  │     WorkflowsPage client shell:
  │       - Realtime: postgres_changes on activity_entries (user channel) → strip update
  │       - Realtime: postgres_changes on approvals (user channel) → badge + strip update
  │       - Client-side fuzzy filter over loaded workflows list (D-17)
  │     Mutations via Server Actions:
  │       editWorkflow(id, patch) → INSERT workflow_versions + UPDATE workflows
  │       togglePause(id) → UPDATE workflows.status
  │
  ├── /app/workflows/[id] (RSC shell)
  │     Initial fetch: workflow + versions(last 10) + runs(last 20)
  │         ↓
  │     WorkflowDetailPage client shell:
  │       - click-to-edit → blur/Enter → editWorkflow Server Action
  │       - SchedulePicker → editWorkflow
  │       - LevelToggle → editWorkflow (L3: one-time confirm dialog first)
  │       - RunNow → runNow Server Action → inngest.send('workflow.run_requested')
  │       - Realtime: postgres_changes on workflow_runs WHERE workflow_id = X
  │           → new run row appears in Historical Runs within seconds
  │     Server Actions:
  │       editWorkflow(id, patch) → version transaction
  │       restoreVersion(workflowId, versionId) → INSERT new version (forward)
  │       runNow(workflowId) → inngest.send + return runId
  │
  ├── /app/activity (RSC shell)
  │     Initial fetch: activity_entries page 1 (cursor, LIMIT 50, filters from URL params)
  │         ↓
  │     ActivityPage client shell:
  │       - @tanstack/react-virtual: virtualizes the scrollable entry list
  │       - Filter chips + Filter popover → update URL search params → RSC re-renders
  │       - Select mode toggle → checkbox reveals → bulk action bar
  │       - Entry click → ActivityDetail panel (no extra fetch; data in memory)
  │       - Reasoning chain: render inline JSON if reasoning_chain != null;
  │           else fetch reasoning_chain_url from Supabase Storage on demand
  │       - Revert / Bulk Revert → Server Actions
  │     Server Actions:
  │       revertActivity(activityId) → canRevert check → Shopify/Gmail adapter → revert_* entry
  │       bulkRevertActivity(activityIds[]) → Drizzle transaction
  │
  └── middleware.ts
        /app → /app/workflows (307)
        /app/home → /app/workflows (307)

Agent Tier (Inngest)
  ├── executeWorkflowRun (existing — unchanged)
  │     Triggered by workflow.run_requested event (from runNow Server Action or scheduler)
  │     On complete: workflow_runs row status → 'succeeded'
  │       → Realtime broadcast → WorkflowDetail historical runs updates
  │
  └── (future) prunWorkflowVersions nightly cron
        Prune workflow_versions WHERE version_number < (max - 10) per workflow
        (Retention enforcement for D-03/D-04)

Shared Lib
  └── lib/workflows/revert.ts
        canRevert(entry, shopifyUpdatedAt?) → { allowed: bool, reason?: string }
        Used by: ActivityDetail UI (show/hide), revertActivity Server Action (enforce)
```

### Recommended Project Structure (Phase 3 additions)

```
app/
├── app/
│   ├── workflows/
│   │   ├── page.tsx                    # My Workflows RSC — groups + strip
│   │   └── [id]/
│   │       └── page.tsx                # Workflow Detail RSC
│   ├── activity/
│   │   └── page.tsx                    # Activity log RSC — page 1
│   └── home/
│       └── page.tsx                    # Thin redirect → /app/workflows (D-16)

components/
├── workflows/
│   ├── workflow-row.tsx                # WorkflowRow: LevelToggle, pause/resume, status dot
│   ├── workflow-group.tsx              # WorkflowGroup section with status header
│   ├── workflow-detail-header.tsx      # Inline-edit name/description header
│   ├── schedule-picker.tsx             # D-02: structured schedule editor
│   ├── workflow-diagram.tsx            # Step graph visualization
│   ├── version-history-panel.tsx       # D-04: compact version list + Restore
│   ├── run-now-dialog.tsx              # D-05: confirm dialog for write/L3
│   ├── historical-runs-panel.tsx       # Timeline of recent runs (right panel)
│   └── recent-activity-strip.tsx       # 3-stat strip on My Workflows
├── activity/
│   ├── activity-row.tsx                # Virtualizable list row
│   ├── activity-detail.tsx             # Right-panel detail + before/after diff
│   ├── activity-filters.tsx            # Chips + Filter popover + removable pills
│   ├── before-after-diff.tsx           # D-14: field-level diff renderer
│   ├── reasoning-chain.tsx             # Inline or blob-fetched chain
│   ├── bulk-revert-modal.tsx           # D-08: split revertable/blocked
│   └── revert-tooltip.tsx              # D-09: disabled revert + accessible tooltip

lib/
├── workflows/
│   ├── activity.ts                     # (existing) — no changes
│   ├── approvals.ts                    # (existing) — no changes
│   ├── revert.ts                       # NEW: canRevert() + revertActivity logic
│   └── versions.ts                     # NEW: createVersion() transaction helper
└── actions/
    ├── workflows.ts                    # Server Actions: editWorkflow, restoreVersion, runNow
    └── activity.ts                     # Server Actions: revertActivity, bulkRevertActivity

supabase/migrations/
└── 0005_activity_indexes.sql           # NEW: composite indexes for Activity filter queries
```

### Pattern 1: Versioning on Every Inline Edit (D-03/WF-14)

**What:** Every inline save (name, description, schedule, level, pause/resume) must atomically: (1) INSERT a new workflow_versions row with incremented version_number, (2) UPDATE workflows.current_version_id to the new version, (3) trigger 10-version retention pruning.

**When to use:** Every mutation that changes workflow configuration.

```typescript
// lib/workflows/versions.ts
// Source: DATA-FLOW.md §3.2 + live schema inspection

export async function createWorkflowVersion(
  db: DrizzleDb,  // must be inside withUserRls() context
  userId: string,
  workflowId: string,
  patch: Partial<WorkflowDefinition>,
  threadId?: string
): Promise<{ newVersionId: string; newVersionNumber: number }> {
  return db.transaction(async (tx) => {
    // 1. Load current version definition
    const [current] = await tx
      .select({ current_version_id: workflows.current_version_id })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
      .limit(1);

    if (!current) throw new Error('Workflow not found');

    // 2. Load current definition (to merge patch into)
    const [currentVersion] = await tx
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, current.current_version_id!))
      .limit(1);

    // 3. Get next version_number
    const [maxRow] = await tx
      .select({ max: max(workflowVersions.version_number) })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflow_id, workflowId));
    const nextVersionNumber = (maxRow?.max ?? 0) + 1;

    // 4. INSERT new version
    const [newVersion] = await tx
      .insert(workflowVersions)
      .values({
        workflow_id: workflowId,
        version_number: nextVersionNumber,
        definition: mergeDefinitionPatch(currentVersion.definition, patch),
        schema_version: 1,
        created_by_thread_id: threadId ?? null,
      })
      .returning();

    // 5. UPDATE workflow: current_version_id + any surface-level fields (name/description/level)
    await tx
      .update(workflows)
      .set({
        current_version_id: newVersion.id,
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.automation_level !== undefined && { automation_level: patch.automation_level }),
        ...(patch.trigger_type !== undefined && { trigger_type: patch.trigger_type }),
        ...(patch.trigger_config !== undefined && { trigger_config: patch.trigger_config }),
        updated_at: new Date(),
      })
      .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)));

    // 6. Prune: keep only last 10 versions
    // Use a subquery to find the IDs of versions to delete
    await tx.execute(sql`
      DELETE FROM workflow_versions
      WHERE workflow_id = ${workflowId}
        AND version_number < (
          SELECT MAX(version_number) - 9
          FROM workflow_versions
          WHERE workflow_id = ${workflowId}
        )
    `);

    return { newVersionId: newVersion.id, newVersionNumber: nextVersionNumber };
  });
}
```

**Key insight on Restore (D-04):** Restore calls `createWorkflowVersion` with the target version's definition as the patch — it does NOT update old rows. The history grows forward. This is identical to how "Open in Chat → edit → save" creates a new version.

### Pattern 2: canRevert() Drift Function (D-11/ACT-08)

**What:** Shared pure-ish function that determines if an activity entry can be reverted. Called from both the UI (to show/disable the button) and the Server Action (to enforce before writing).

**When to use:** Any code that renders or acts on revert eligibility.

```typescript
// lib/workflows/revert.ts
// Source: DATA-FLOW.md §10.6 + Operator Zero PRD §5.4.4

export type RevertWindow = 'content' | 'structural' | 'sent' | 'never';

// Map action_type → revert window category
// content = 7d, structural = 24h, sent = never
const ACTION_TYPE_WINDOW: Record<string, RevertWindow> = {
  update_product:       'content',     // product description / meta fields
  update_meta_title:    'content',
  update_meta_desc:     'content',
  update_image_alt:     'content',
  update_page_content:  'content',
  update_price:         'structural',  // structural — changed business logic
  update_inventory:     'structural',
  update_status:        'structural',
  create_redirect:      'structural',
  send_email_draft:     'sent',        // never revertable — sent means sent
  send_email_reply:     'sent',
  // Default: treat unknown as content (7d) for safety
};

const WINDOW_SECONDS: Record<RevertWindow, number> = {
  content:    7  * 24 * 3600,
  structural: 24 * 3600,
  sent:       0,  // never
  never:      0,
};

export interface CanRevertResult {
  allowed: boolean;
  reason?: 'out_of_window' | 'sent' | 'manually_edited_since' | 'already_reverted' | 'is_revert_entry';
}

/**
 * canRevert — pure function; determines revert eligibility.
 *
 * shopifyUpdatedAt is only needed for product/page targets.
 * Callers pre-fetch it via the target_id lookup or pass undefined
 * (which disables the manually-edited-since check — safe for non-Shopify targets).
 *
 * Called from:
 *   - ActivityDetail component (UI show/hide/disable)
 *   - revertActivity Server Action (enforcement, re-fetches shopifyUpdatedAt fresh)
 */
export function canRevert(
  entry: Pick<ActivityEntry, 'action_type' | 'occurred_at' | 'is_revertable' | 'reverted_at' | 'before_state'>,
  shopifyUpdatedAt?: Date | null
): CanRevertResult {
  // Already reverted
  if (entry.reverted_at) return { allowed: false, reason: 'already_reverted' };

  // Schema-flagged as non-revertable (e.g., revert_* entries themselves)
  if (!entry.is_revertable) return { allowed: false, reason: 'is_revert_entry' };

  const window = ACTION_TYPE_WINDOW[entry.action_type] ?? 'content';

  // Sent emails: never revertable
  if (window === 'sent' || window === 'never') return { allowed: false, reason: 'sent' };

  // Time window check
  const ageSeconds = (Date.now() - new Date(entry.occurred_at).getTime()) / 1000;
  if (ageSeconds > WINDOW_SECONDS[window]) return { allowed: false, reason: 'out_of_window' };

  // Manually edited since check (product/page targets)
  if (shopifyUpdatedAt && shopifyUpdatedAt > new Date(entry.occurred_at)) {
    return { allowed: false, reason: 'manually_edited_since' };
  }

  return { allowed: true };
}

// Human-readable reason strings for tooltips (D-09)
export const REVERT_REASON_LABELS: Record<NonNullable<CanRevertResult['reason']>, string> = {
  out_of_window:          'Outside the revert window (7d for content, 24h for structural changes)',
  sent:                   'Sent emails can\'t be unsent — the agent can draft a follow-up instead',
  manually_edited_since:  'This product was edited after the agent action; reverting might overwrite your changes',
  already_reverted:       'This action has already been reverted',
  is_revert_entry:        'Revert actions themselves cannot be reverted',
};
```

**Detecting "manually edited since" reliably:** Query `shopify_products.shopify_updated_at WHERE (user_id, product_gid) = (userId, entry.target_id)`. This column is updated by both the Shopify webhook handler (flow 10.4) and the polling fallback whenever an external edit occurs. If the column does not exist for the target_id (product deleted) or is NULL, treat as "cannot determine" → allow revert conservatively.

**Server Action enforcement pattern:**

```typescript
// lib/actions/activity.ts
'use server';
export async function revertActivity(activityId: string): Promise<void> {
  const userId = await requireUserId();

  return withUserRls(async (db) => {
    const [entry] = await db
      .select().from(activityEntries)
      .where(and(eq(activityEntries.id, activityId), eq(activityEntries.user_id, userId)))
      .limit(1);
    if (!entry) throw new Error('Not found');

    // Re-fetch shopifyUpdatedAt fresh for product targets (Server Action must re-check)
    let shopifyUpdatedAt: Date | null = null;
    if (entry.target_type === 'product' && entry.target_id) {
      const [product] = await db
        .select({ shopify_updated_at: shopifyProducts.shopify_updated_at })
        .from(shopifyProducts)
        .where(and(eq(shopifyProducts.user_id, userId), eq(shopifyProducts.product_gid, entry.target_id)))
        .limit(1);
      shopifyUpdatedAt = product?.shopify_updated_at ?? null;
    }

    const check = canRevert(entry, shopifyUpdatedAt);
    if (!check.allowed) throw new Error(REVERT_REASON_LABELS[check.reason!]);

    // Observability-first: write revert entry BEFORE external API call
    await writeActivity(userId, {
      workflow_run_id: entry.workflow_run_id,
      step_id: `revert:${activityId}`,
      action_type: `revert_${entry.action_type}`,
      summary: `Reverted: ${entry.action_summary}`,
      result: 'success',
      automation_level: entry.automation_level ?? undefined,
      workflow_id: entry.workflow_id ?? undefined,
      target_type: entry.target_type ?? undefined,
      target_id: entry.target_id ?? undefined,
      is_revertable: false,  // revert entries cannot be re-reverted
    });

    // Execute the reversal via the appropriate adapter
    await executeRevertEffect(entry, userId);

    // Mark original as reverted
    await db
      .update(activityEntries)
      .set({ reverted_at: new Date() })
      .where(eq(activityEntries.id, activityId));
  });
}
```

### Pattern 3: Atomic Bulk Revert (D-08/ACT-05)

**What:** All-or-none transaction. Pre-flight check separates revertable from blocked before executing any write.

```typescript
// lib/actions/activity.ts
'use server';
export async function bulkRevertActivity(
  activityIds: string[]
): Promise<{ reverted: string[]; blocked: Array<{ id: string; reason: string }> }> {
  const userId = await requireUserId();

  return withUserRls(async (db) => {
    // Phase 1: classify all entries (no writes yet)
    const entries = await db
      .select().from(activityEntries)
      .where(and(
        inArray(activityEntries.id, activityIds),
        eq(activityEntries.user_id, userId)
      ));

    // Pre-fetch shopify_updated_at for all product targets in one query
    const productTargetIds = entries
      .filter(e => e.target_type === 'product' && e.target_id)
      .map(e => e.target_id!);

    const shopifyTimestamps = productTargetIds.length > 0
      ? await db.select({ product_gid: shopifyProducts.product_gid, updated: shopifyProducts.shopify_updated_at })
          .from(shopifyProducts)
          .where(and(eq(shopifyProducts.user_id, userId), inArray(shopifyProducts.product_gid, productTargetIds)))
      : [];

    const shopifyMap = new Map(shopifyTimestamps.map(r => [r.product_gid, r.updated]));

    const revertable: ActivityEntry[] = [];
    const blocked: Array<{ id: string; reason: string }> = [];

    for (const entry of entries) {
      const shopifyUpdatedAt = entry.target_type === 'product' ? shopifyMap.get(entry.target_id ?? '') ?? null : null;
      const check = canRevert(entry, shopifyUpdatedAt);
      if (check.allowed) revertable.push(entry);
      else blocked.push({ id: entry.id, reason: REVERT_REASON_LABELS[check.reason!] });
    }

    // If caller chose to proceed with revertable-only (after confirming in D-08 modal):
    // Execute all reversals inside a single transaction
    await db.transaction(async (tx) => {
      for (const entry of revertable) {
        // writeActivity for each (observability-first)
        await writeActivity(userId, { /* revert entry fields */ });
        await executeRevertEffect(entry, userId);
        await tx.update(activityEntries)
          .set({ reverted_at: new Date() })
          .where(eq(activityEntries.id, entry.id));
      }
    });

    return { reverted: revertable.map(e => e.id), blocked };
  });
}
```

**Note on D-08 UX flow:** The Server Action returns `{ reverted, blocked }`. The confirmation modal (rendered client-side before calling the Server Action) calls a "dry run" variant first to get the split, then the user confirms, then the full Server Action executes. Alternatively, the modal can call bulkRevertActivity which always proceeds with only the revertable ones and returns the blocked list for display — this eliminates the round-trip.

### Pattern 4: Run Now (D-05/WF-13)

**What:** Trigger the existing `executeWorkflowRun` Inngest function from a Server Action. The run must appear in Historical Runs within seconds.

```typescript
// lib/actions/workflows.ts
'use server';
export async function runNow(workflowId: string): Promise<{ runTriggered: boolean }> {
  const userId = await requireUserId();

  // Ownership check
  await withUserRls(async (db) => {
    const [wf] = await db.select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.user_id, userId)))
      .limit(1);
    if (!wf) throw new Error('Workflow not found');
  });

  // Trigger Inngest — same event the scheduler sends
  await inngest.send({
    name: 'workflow.run_requested',
    data: {
      userId,
      workflowId,
      triggerSource: 'manual',
    },
  });

  return { runTriggered: true };
}
```

**Idempotency on "Run Now":** The existing `executeWorkflowRun` Inngest function has `concurrency: { limit: 1, key: 'event.data.userId' }`. A second Run Now while one is in-flight will queue behind it — Inngest handles this. No additional idempotency key needed for the trigger itself; double-clicking "Run Now" quickly would send two events but the second would queue.

**Live appearance in Historical Runs:** The `WorkflowDetailPage` client subscribes to Supabase Realtime `postgres_changes` on `workflow_runs WHERE workflow_id = X`. When `executeWorkflowRun` INSERTs the new `workflow_runs` row in its `load-and-create-run` step, the Realtime subscription fires and the client adds the run to the timeline. Subscribe pattern mirrors `message-stream.tsx` (Phase 2).

**Confirm for write/L3 (D-05):** Client-side confirm dialog before calling `runNow`. The Server Action does not need to know whether a confirm was shown — the confirm is purely a UX gate. The workflow's `automation_level` is available in the RSC-fetched data to determine whether to show the dialog.

### Pattern 5: Activity Pagination with Filters (ACT-07)

**What:** Cursor-based pagination (keyed on `occurred_at + id` to handle ties). Page size 50. Filters compose with AND. Virtual rendering with `@tanstack/react-virtual`.

```typescript
// Activity log query (Server Action / Route Handler)
async function fetchActivityPage(
  userId: string,
  filters: ActivityFilters,
  cursor?: { occurred_at: Date; id: string }
): Promise<ActivityEntry[]> {
  return withUserRls(async (db) => {
    const conditions = [eq(activityEntries.user_id, userId)];

    if (cursor) {
      conditions.push(
        or(
          lt(activityEntries.occurred_at, cursor.occurred_at),
          and(eq(activityEntries.occurred_at, cursor.occurred_at), lt(activityEntries.id, cursor.id))
        )!
      );
    }
    if (filters.workflowId) conditions.push(eq(activityEntries.workflow_id, filters.workflowId));
    if (filters.result) conditions.push(eq(activityEntries.result, filters.result));
    if (filters.automationLevel) conditions.push(eq(activityEntries.automation_level, filters.automationLevel));
    if (filters.dateFrom) conditions.push(gte(activityEntries.occurred_at, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(activityEntries.occurred_at, filters.dateTo));

    return db.select().from(activityEntries)
      .where(and(...conditions))
      .orderBy(desc(activityEntries.occurred_at), desc(activityEntries.id))
      .limit(50);
  });
}
```

**Virtualization with `@tanstack/react-virtual`:**

```tsx
// components/activity/activity-log.tsx (client component)
import { useVirtualizer } from '@tanstack/react-virtual';

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,    // ActivityRow height in px
    overscan: 10,              // render 10 rows above/below viewport
  });

  return (
    <div ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <ActivityRow entry={entries[virtualRow.index]!} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Day-grouping with virtualization:** The design file groups entries by day with sticky headers. With virtualization, the simplest approach is to flatten the grouped array into a mixed array of `{ type: 'header', day: string } | { type: 'row', entry: ActivityEntry }` items and pass all of them to the virtualizer. The header rows get `estimateSize: () => 36` and the entry rows `52`. This preserves the sticky-day-header visual without DOM tricks.

### Pattern 6: Before/After Field-Level Diff (D-14)

**What:** Render `before_state → after_state` as human-readable field names with old and new values. The JSONB shape differs by `target_type`.

**Approach:** A `renderDiff(before, after, targetType)` function maps known field keys to display labels per target_type. For unknown keys, fall back to the raw key name.

```typescript
// components/activity/before-after-diff.tsx
const FIELD_LABELS: Record<string, Record<string, string>> = {
  product: {
    meta_title:       'Meta title',
    meta_description: 'Meta description',
    body_html:        'Description',
    status:           'Status',
    price:            'Price',
  },
  email: {
    subject:  'Subject',
    body:     'Body',
    to:       'To',
  },
  page: {
    title:     'Page title',
    body_html: 'Page content',
    handle:    'URL handle',
  },
};

export function renderFieldDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  targetType: string
): Array<{ field: string; label: string; oldValue: unknown; newValue: unknown }> {
  if (!before && !after) return [];
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const labels = FIELD_LABELS[targetType] ?? {};
  return [...allKeys].map(key => ({
    field: key,
    label: labels[key] ?? key,
    oldValue: (before ?? {})[key],
    newValue: (after ?? {})[key],
  })).filter(d => d.oldValue !== d.newValue);
}
```

### Pattern 7: Realtime for Strip Counts and Run Appearance

**What:** My Workflows recent-activity strip shows three real-time values (D-15). Workflow Detail shows runs appearing within seconds of "Run Now". Both use Supabase Realtime `postgres_changes`.

**Established pattern from Phase 2** (`message-stream.tsx` and `inline-approval-card.tsx`):

```tsx
// Pattern: subscribe to postgres_changes for a user-scoped table
// (reuses Phase 2 setAuth pattern — identical boilerplate)
useEffect(() => {
  let supabase: ReturnType<typeof createBrowserClient> | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  async function subscribe() {
    supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(session?.access_token ?? null);

    channel = supabase.channel(`activity:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_entries',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        // Update strip counts in local state
        handleNewActivity(payload.new as ActivityEntry);
      })
      .subscribe();
  }
  subscribe();
  return () => { channel?.unsubscribe(); };
}, [userId]);
```

**For My Workflows strip:** Subscribe to both `activity_entries` (INSERT) for the ticker/L3 count and `approvals` (INSERT + UPDATE) for the pending count. Both use `filter: user_id=eq.${userId}`.

**For Workflow Detail runs:** Subscribe to `workflow_runs` (INSERT + UPDATE) with `filter: workflow_id=eq.${workflowId}`. On INSERT: add the new run to the top of the Historical Runs timeline. On UPDATE (status change): update the run's displayed status.

**Realtime channel naming for new subscriptions:** Phase 2 used `thread:<id>` and `approval:<id>` as private channel names with matching RLS policies. For Phase 3's broader user-scoped subscriptions (`activity:${userId}` and `runs:${workflowId}`), we need matching `realtime.messages` RLS policies. This requires **migration 0005** to add two new policies (see SQL below).

### Anti-Patterns to Avoid

- **Versioning with UPDATE instead of INSERT:** Never mutate existing `workflow_versions` rows. Every change must INSERT a new row. The version history is append-only.
- **canRevert() only in UI:** If canRevert() is only in the client, a user can call the Server Action directly (e.g., via DevTools) bypassing the drift check. The Server Action MUST re-evaluate independently.
- **Trusting cursor from client without ownership check:** The cursor (occurred_at, id) comes from the client; the Server Action must still filter by user_id to prevent cross-user pagination.
- **Running bulk revert as N sequential Server Action calls:** Not atomic. Use one Server Action with a Drizzle transaction.
- **Virtualizing with fixed height per row:** ActivityRow height can vary if description text wraps. Use `measureElement` option in `useVirtualizer` for dynamic heights, or constrain row height via CSS `overflow: hidden` + fixed line count.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Virtual scrolling 1000+ rows | Custom windowing math | `@tanstack/react-virtual` | DOM measurement, scroll position, overscan, and resize handling are non-trivial |
| Click-to-edit text field | Custom contentEditable | `<input>` that appears on click + CSS display toggle | contentEditable has cursor-position bugs; plain input with `autoFocus` is reliable |
| Schedule → cron translation | Custom parser | Structured picker → fixed cron patterns | Sarah never writes cron (D-02); the picker maps to a cron string server-side |
| Field-level diff algorithm | Myers diff / LCS | Simple key-by-key compare of known fields | Agent actions change specific known fields; no free-form text diffing needed |
| Drizzle transaction syntax | Raw SQL in PG function | `db.transaction(async (tx) => { ... })` | Drizzle transactions are already in use (lib/db/client.ts); syntax is established |
| Tooltip accessibility | Custom tooltip div | Radix `Tooltip` primitive (already installed via @radix-ui/react-dialog) | Radix Tooltip handles keyboard navigation, focus, aria-describedby automatically |

---

## New Migration Required: 0005

### Why

The existing `idx_activity_user_time(user_id, occurred_at DESC)` is a covering index for the base query but not for filtered queries. When the user filters by workflow_id + date range + result + automation_level, Postgres cannot use this index efficiently — it must scan many rows to apply the WHERE clauses.

With 1,000+ entries and 5 simultaneous filter dimensions combining with AND, query time without compound indexes can exceed 200ms on cold cache (failing the <1s p50 target for ACT-07).

### Migration SQL

```sql
-- 0005_activity_indexes.sql
-- Phase 3: composite indexes for Activity log filter performance (ACT-07)
-- Applied via: npx supabase db push (never drizzle-kit migrate)

-- Compound index for workflow filter + time sort (most common filter combo)
CREATE INDEX IF NOT EXISTS "idx_activity_user_workflow_time"
  ON "activity_entries" USING btree ("user_id", "workflow_id", "occurred_at" DESC)
  WHERE "workflow_id" IS NOT NULL;

-- Compound index for result filter + time sort
CREATE INDEX IF NOT EXISTS "idx_activity_user_result_time"
  ON "activity_entries" USING btree ("user_id", "result", "occurred_at" DESC);

-- Compound index for automation level filter + time sort
CREATE INDEX IF NOT EXISTS "idx_activity_user_level_time"
  ON "activity_entries" USING btree ("user_id", "automation_level", "occurred_at" DESC)
  WHERE "automation_level" IS NOT NULL;

-- Realtime RLS: user-scoped activity_entries channel
-- (Realtime channel pattern from migration 0004; extends to activity and workflow_runs)
ALTER TABLE IF EXISTS "realtime"."messages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authn can receive own activity channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own activity channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^activity:[0-9a-fA-F-]{36}$'
    AND (split_part(realtime.topic(), ':', 2))::uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "authn can receive own runs channel" ON "realtime"."messages";
CREATE POLICY "authn can receive own runs channel"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^runs:[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.workflow_runs wr
      WHERE wr.workflow_id = (split_part(realtime.topic(), ':', 2))::uuid
        AND wr.user_id = (SELECT auth.uid())
    )
  );
```

**Note on the `runs:` channel:** The policy uses a subquery on `workflow_runs` to verify the requesting user owns at least one run for that workflow_id. Alternatively, the channel can be named `workflow:<id>` and verify against the `workflows` table. Either works; `runs:<workflowId>` is more explicit about what data the channel carries.

---

## Common Pitfalls

### Pitfall 1: Version number race condition on concurrent edits

**What goes wrong:** Two browser tabs both read `MAX(version_number) = 3` and both try to INSERT version 4. One succeeds; the other hits the `UNIQUE(workflow_id, version_number)` constraint.

**Why it happens:** The version number is computed with a SELECT MAX() then INSERT — not atomic without a transaction or advisory lock.

**How to avoid:** The `createWorkflowVersion` transaction in Pattern 1 above uses a SELECT MAX() inside a Drizzle transaction. At `SERIALIZABLE` isolation this is safe; at default `READ COMMITTED` a retry loop on constraint violation is needed. Simpler: use `ON CONFLICT (workflow_id, version_number) DO NOTHING` and retry the full transaction with a fresh MAX read. For v1 single-user portfolio (5–20 workflows), simultaneous edits are rare — log the conflict and retry once.

**Warning signs:** 409 errors from the Server Action; `duplicate key value violates unique constraint "workflow_versions_workflow_version_unique"`.

### Pitfall 2: Realtime subscription leaks on React StrictMode double-mount

**What goes wrong:** In development, React StrictMode mounts + unmounts + remounts effects. Without a proper cleanup, two Realtime subscriptions exist for the same channel, producing duplicate state updates.

**Why it happens:** `useEffect` without proper cleanup. Supabase `channel.subscribe()` returns a subscription but the phase 2 pattern (see `message-stream.tsx`) handles cleanup via `channel.unsubscribe()` in the effect cleanup. Copy that pattern exactly.

**How to avoid:** The cleanup pattern from Phase 2 is correct — return `() => { channel?.unsubscribe(); }` from the effect. In StrictMode, the second mount creates a fresh channel after the first is cleaned up.

**Warning signs:** Activity strip count doubles on each update; console shows two subscription confirmations.

### Pitfall 3: Inline edit blur fires before click on save button

**What goes wrong:** Click-to-edit field where clicking a "save" button causes the field to blur, which triggers an auto-save, then the button click also triggers a save — two version increments for one edit.

**Why it happens:** `onBlur` fires before `onClick`. Wrapping the save button in `onMouseDown` (which fires before blur) + `preventDefault` prevents the blur from firing. Alternatively, use `Enter` to save and `Escape` to cancel (standard pattern) with no save button.

**How to avoid:** For D-01 (name/description), use blur + Enter to save, Escape to cancel, no separate Save button. The design file shows inline edit without a visible save button — the blur-saves pattern is correct.

**Warning signs:** Two successive version numbers created for a single user action.

### Pitfall 4: filter state in URL params causes full-page RSC re-fetch on every keystroke

**What goes wrong:** If Activity filters update URL search params on every keystroke (for date input), the RSC re-renders and re-fetches on every character.

**Why it happens:** Next.js App Router re-fetches RSC whenever search params change. Eager URL update on fast-changing inputs causes many round-trips.

**How to avoid:** Debounce filter changes (300ms) before updating search params. Use `useTransition` to mark the URL update as non-urgent so the UI doesn't block. Keep quick-select chips (level, result) as instant updates; debounce only the date picker and workflow search input.

**Warning signs:** Network tab shows N requests for a 5-character date input.

### Pitfall 5: Revert leaves before_state null for non-revertable actions

**What goes wrong:** Some activity entries are written with `before_state = null` (read-only steps, classification steps). If `is_revertable = true` is the default but no before_state is captured, the revert has nothing to apply.

**Why it happens:** `writeActivity` defaults `is_revertable = true`. Read-only agent actions that don't capture state still set is_revertable = true.

**How to avoid:** When calling `writeActivity` for read-only actions (queries, classifications), explicitly pass `is_revertable: false`. `canRevert()` checks `entry.is_revertable` first — if the entry was marked non-revertable at write time, the button never appears. The `revert_*` entries written by the revert flow also pass `is_revertable: false`.

**Warning signs:** Revert button appears but clicking it throws because before_state is null.

### Pitfall 6: Version history panel shows "current" as a separate version

**What goes wrong:** The version history panel lists all 10 versions, but the user is already looking at the current version in the Detail view. If the panel doesn't mark the current version, the user can "restore" to the version they're already on, creating a duplicate.

**How to avoid:** Compare each version row's `id` to `workflows.current_version_id`. Mark the matching row as "Current" and disable the Restore button for it.

**Warning signs:** Restoring the current version increments version_number unnecessarily.

---

## Resolved Discretion Items

### Discretion 1: Data-fetching + live updates

**Recommendation:** Server Components for initial fetch + Supabase Realtime for live updates. Do NOT use SWR or React Query — they are not installed and add no value over the RSC + Realtime pattern already established in Phase 2.

- **My Workflows:** RSC fetches workflows + strip counts at render time. Client shell subscribes to `postgres_changes` on `activity_entries` and `approvals` for live strip updates.
- **Workflow Detail:** RSC fetches workflow + versions + last 20 runs. Client shell subscribes to `workflow_runs` for the current workflow_id to show new runs within seconds of "Run Now".
- **Activity:** RSC fetches page 1 (cursor = null). Client handles infinite scroll via a Server Action call for subsequent pages. No Realtime subscription needed on Activity — activity entries are historical, not live. (Exception: if a new entry arrives, the next scroll or filter change will pick it up naturally.)

**Rationale:** The Phase 2 Realtime infrastructure (setAuth, channel authorization via migration 0004) is already in place. Adding new channels follows an established, tested pattern. The alternative (polling) would add network overhead and complexity for a solved problem.

### Discretion 2: Activity log pagination + virtualization

**Recommendation:** Cursor-based pagination (not offset) with page size 50, `@tanstack/react-virtual` for row virtualization.

**Why cursor over offset:** With 1,000+ entries, offset pagination requires `OFFSET N` which forces Postgres to scan and discard N rows. At OFFSET 900, this is 900 discarded rows per query. Cursor pagination always starts from the indexed position.

**Cursor key:** `(occurred_at DESC, id DESC)` — ties in `occurred_at` are broken by `id` descending. Both columns are indexed in `idx_activity_user_time(user_id, occurred_at DESC)`.

**Page size 50:** 50 rows at ~200 bytes each = ~10KB per page (well within Next.js streaming budget). With virtualization, only ~15 rows are rendered at once regardless of total loaded.

**Virtualization:** `@tanstack/react-virtual` v3. Use `estimateSize: () => 52` with the `measureElement` callback for dynamic height measurement. The day-grouping uses a flattened mixed array (headers + rows) as described in Pattern 5.

**Index recommendation:** The existing `idx_activity_user_time` is sufficient for the unfiltered base query. The new compound indexes in migration 0005 cover filtered queries. No additional changes needed.

**Performance estimate:** With `idx_activity_user_time`, an unfiltered cursor query on 1,000 entries executes in ~5ms in Postgres. Network + RSC overhead: ~80ms on Vercel. Total p50: well under 1s.

### Discretion 3: before_state / after_state diff rendering per target_type

**Recommendation:** `renderFieldDiff()` function (Pattern 6 above) with a static `FIELD_LABELS` map per target_type. No external diff library needed — agent actions change specific known fields, not arbitrary text.

For `email` target_type: the diff shows subject + recipient + whether a draft was sent (binary). Render a simple "sent" badge rather than a full diff for sent emails (where the before is "unsent draft" and after is "sent").

For `page` target_type: same field-level approach as product. Body HTML diffs can be long — truncate at 300 chars with "Show more" expand.

### Discretion 4: reasoning_chain inline vs. blob URL

**Recommendation:** Render inline if `entry.reasoning_chain != null` (the JSONB column has data). If `entry.reasoning_chain` is null AND `entry.reasoning_chain_url != null`, fetch the blob on demand when the user expands the "Reasoning chain" section.

DATA-FLOW.md §14 specifies: inline up to 8KB, offloaded to Storage above that. The Activity detail panel only renders for one selected entry at a time — on-demand blob fetch (one request on expand) is fine. Prefetching all blobs would waste bandwidth.

**Implementation:** `reasoning_chain_url` is a Supabase Storage URL. Fetch it with the authenticated Supabase client: `supabase.storage.from('reasoning-chains').download(path)`. The `ReasoningChain` component manages a local `isExpanded` state + `isLoading` state for the blob fetch.

### Discretion 5: "Time saved" heuristic constants

**Recommendation for v1 constants** (labeled "estimated" per D-15):

| Action type | Minutes saved (estimate) |
|-------------|--------------------------|
| update_product (bulk, per product) | 3 |
| generate_meta_title (per product) | 2 |
| send_email_reply | 5 |
| send_email_draft | 4 |
| create_redirect | 2 |
| update_inventory | 1 |
| query_products (catalog audit) | 8 |
| Other / unknown | 2 |

These are labeled as estimates in the UI per D-15. The "Time saved this week" stat is computed as: sum over activity_entries WHERE occurred_at >= 7d ago AND result = 'success' of MINUTES_MAP[action_type]. The computation runs client-side over the loaded strip stats (last 5 entries for the ticker), or a dedicated DB aggregate query can pre-compute it. Recommendation: compute via a simple COUNT query grouped by action_type for the last 7 days — single query, cheap, runs in the RSC initial fetch.

---

## Default Landing Redirect (D-16)

The existing `middleware.ts` delegates to `updateSession` in `lib/auth/middleware.ts`. The middleware currently redirects `/app` prefix routes for auth — it does not redirect `/app` specifically to `/app/workflows`.

**Implementation options:**

1. **In `middleware.ts` directly:** Add a redirect before the auth check:
```typescript
// In updateSession(), before the auth check:
const pathname = request.nextUrl.pathname;
if (pathname === '/app' || pathname === '/app/') {
  return NextResponse.redirect(new URL('/app/workflows', request.url));
}
```

2. **In `app/app/home/page.tsx`:** Convert to a thin redirect:
```typescript
// app/app/home/page.tsx
import { redirect } from 'next/navigation';
export default function HomePage() { redirect('/app/workflows'); }
```

**Recommendation:** Option 2 for `/app/home` (simplest — no middleware change) AND a redirect in `updateSession` for bare `/app` (which currently hits the app shell layout). Bare `/app` currently renders the layout without a page — converting it to redirect is cleaner than keeping a hollow route.

---

## Validation Architecture

> nyquist_validation is enabled (absent = true in config).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (from Phase 1/2) |
| Config file | `vitest.config.mts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WF-14 | `createWorkflowVersion` increments version_number atomically | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ Wave 0 |
| WF-14 | Restore creates a NEW forward version (does not mutate old rows) | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ Wave 0 |
| WF-14 | 10-version retention prune removes oldest, preserves latest 10 | unit | `npx vitest run tests/unit/workflows/versions.test.ts` | ❌ Wave 0 |
| ACT-08 | `canRevert()` returns `allowed:false` for entries outside 7d content window | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ Wave 0 |
| ACT-08 | `canRevert()` returns `allowed:false` for sent email (window=sent) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ Wave 0 |
| ACT-08 | `canRevert()` returns `allowed:false` when shopifyUpdatedAt > occurred_at | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ Wave 0 |
| ACT-08 | `canRevert()` returns `allowed:false` for structural edits outside 24h | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ Wave 0 |
| ACT-05 | `bulkRevertActivity` returns correct split of revertable vs blocked (no writes) | unit | `npx vitest run tests/unit/workflows/revert.test.ts` | ❌ Wave 0 |
| ACT-07 | Activity page renders 50-item page without error (smoke) | smoke | `npx vitest run tests/smoke/activity.test.ts` | ❌ Wave 0 |
| WF-13 | `runNow` Server Action sends correct Inngest event with userId + workflowId | unit (mock inngest) | `npx vitest run tests/unit/actions/workflows.test.ts` | ❌ Wave 0 |
| WF-07 | My Workflows groups workflows by status correctly | unit | `npx vitest run tests/unit/workflows/grouping.test.ts` | ❌ Wave 0 |
| D-16 | `/app` redirects to `/app/workflows` | integration/manual | Manual browser check | N/A |

**Trust-critical behaviors requiring test coverage before deployment:**
- `canRevert()`: all 5 failure modes + the success path (8 test cases)
- `createWorkflowVersion`: atomicity + retention enforcement + restore creates forward version
- `bulkRevertActivity`: dry-run classification returns correct split before any writes

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/` (fast, no DB)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/workflows/versions.test.ts` — covers WF-14 version increment, restore, prune (mock db)
- [ ] `tests/unit/workflows/revert.test.ts` — covers canRevert() all cases (pure function, no mock needed)
- [ ] `tests/unit/actions/workflows.test.ts` — covers runNow (mock inngest.send)
- [ ] `tests/unit/workflows/grouping.test.ts` — covers My Workflows status grouping logic (pure function)
- [ ] `tests/smoke/activity.test.ts` — covers Activity page rendering without error

---

## Security Domain

> security_enforcement is enabled (not set to false).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Server Actions must verify session) | `requireUserId()` / `withUserRls()` — established Phase 2 pattern |
| V3 Session Management | yes (middleware guards /app routes) | `updateSession` in middleware — no changes needed |
| V4 Access Control | yes (workflow/activity ownership checks) | RLS + explicit `user_id` filter in every Server Action |
| V5 Input Validation | yes (Server Action inputs) | Zod schemas on all Server Action inputs (established pattern) |
| V6 Cryptography | no (no new cryptographic operations) | — |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Revert a different user's activity entry | Spoofing / Elevation | Server Action filters `activity_entries WHERE user_id = userId` before canRevert check |
| Trigger runNow for a workflow not owned by requester | Spoofing | Server Action verifies workflow ownership before inngest.send |
| Bulk revert with cross-user entry IDs in the list | Spoofing | Server Action filters all IDs by user_id; foreign IDs silently excluded (not an error — same as Phase 2 approval ownership pattern) |
| Realtime subscription to another user's activity channel | Information Disclosure | Migration 0005 adds RLS policy: `activity:<userId>` channel verifies `userId == auth.uid()` |
| Version restore to an old version owned by a different workflow | Spoofing | Server Action verifies both `workflow_id` and `user_id` on version lookup |
| `before_state` / `after_state` JSONB contains injected script in rendered diff | XSS | Diff renderer treats all field values as data (React auto-escapes); never use `dangerouslySetInnerHTML` for diff output |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All surfaces | ✓ | 25.6.1 | — |
| Supabase CLI | Migration 0005 push | [ASSUMED present from Phase 2] | — | Supabase dashboard SQL editor |
| Inngest local dev server | runNow local testing | [ASSUMED present from Phase 2] | — | Inngest cloud dev mode |
| Supabase Realtime | Live strip / run appearance | ✓ (Phase 2 confirmed working, migration 0004 applied) | — | Polling fallback (not recommended) |
| Framer Motion | Activity animations | ✓ (installed) | 12.40.0 | CSS transitions (reduced-motion fallback) |

**Missing dependencies with no fallback:** None identified.

---

## Code Examples

### Inline Edit Click-to-Edit Pattern

```tsx
// components/workflows/inline-editable-text.tsx
'use client';
import { useState, useRef } from 'react';

interface Props {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

export function InlineEditableText({ value, onSave, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleBlur() {
    setEditing(false);
    if (draft !== value) {
      await onSave(draft);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className={className}
        // No separate save button — blur + Enter saves, Escape cancels
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`cursor-text ${className}`}
      title="Click to edit"
    >
      {value}
    </span>
  );
}
```

### Server Action: editWorkflow

```typescript
// lib/actions/workflows.ts
'use server';
import { withUserRls } from '@/lib/db/client';
import { requireUserId } from '@/lib/auth/server';
import { createWorkflowVersion } from '@/lib/workflows/versions';
import { revalidatePath } from 'next/cache';

export async function editWorkflow(
  workflowId: string,
  patch: {
    name?: string;
    description?: string;
    automation_level?: 'L1' | 'L2' | 'L3';
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }
) {
  const userId = await requireUserId();
  return withUserRls(async (db) => {
    await createWorkflowVersion(db, userId, workflowId, patch);
    revalidatePath(`/app/workflows/${workflowId}`);
    revalidatePath('/app/workflows');
  });
}
```

---

## Assumptions Log

> Claims tagged [ASSUMED] in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tanstack/react-virtual` v3.13.25 is the current stable version | Standard Stack | Planner installs wrong version; minor — npm view verifies before install |
| A2 | Supabase CLI is available from Phase 2 (not re-verified in this session) | Environment Availability | Migration 0005 cannot be pushed; fallback: dashboard SQL editor |
| A3 | The `runs:<workflowId>` Realtime channel authorization can use a subquery on `workflow_runs` for ownership | Architecture Patterns (Pattern 7 / migration 0005) | If the subquery is too slow for Realtime auth, use `workflow:<workflowId>` channel with a query on `workflows` table instead |
| A4 | `canRevert()` treating unknown action_types as 'content' (7d window) is the correct default | Pattern 2 | Unknown action types that should never be revertable would be incorrectly shown as revertable; fix by adding them to ACTION_TYPE_WINDOW map |
| A5 | TIME_SAVED_MINUTES constants are reasonable placeholders for v1 launch | Discretion 5 | "Time saved" stat shows implausible numbers; labeled "estimated" per D-15 mitigates trust damage; tune post-beta |

---

## Open Questions (RESOLVED)

1. **Realtime authorization for user-scoped channels (activity:userId, runs:workflowId)**
   - What we know: Migration 0004 added policies for `thread:<uuid>` and `approval:<uuid>`. Phase 2 components use those channels successfully.
   - What's unclear: The `activity:<userId>` policy is simpler (direct uid comparison) — likely works. The `runs:<workflowId>` policy requires a subquery on `workflow_runs` or `workflows` — needs testing under Supabase Realtime's RLS evaluation timing.
   - Recommendation: Implement as specified in migration 0005. If the `runs:` channel subquery causes auth latency, fall back to polling `workflow_runs` every 3s after "Run Now" (acceptable given the use case is infrequent).

2. **Drizzle transaction isolation for version increment race condition**
   - What we know: The `UNIQUE(workflow_id, version_number)` constraint prevents duplicate version numbers. Drizzle transactions default to `READ COMMITTED`.
   - What's unclear: Under concurrent edit (two tabs), `READ COMMITTED` may allow both to read MAX=3 before either inserts — the second will fail with a constraint violation.
   - Recommendation: Add a try/catch in `createWorkflowVersion` that retries once on `23505` (unique_violation) with a fresh MAX read. For v1 single-user usage this scenario is very rare, but the retry makes it robust.

3. **Bulk revert confirmation modal: return blocked list before executing vs. execute + report**
   - What we know: D-08 says "confirmation modal that splits revertable vs blocked items with reasons." This implies the user sees the split before confirming.
   - What's unclear: Does this require two round-trips (classify-then-confirm-then-execute) or one (execute-only-revertable and return report)?
   - Recommendation: One-trip. `bulkRevertActivity` accepts a `dryRun: boolean` parameter. With `dryRun: true`, it returns the classification without writing. With `dryRun: false` (after user confirms), it executes. The modal calls dry-run first, shows the split, then calls execute on confirm.

---

## Sources

### Primary (HIGH confidence)
- `Docs/DATA-FLOW.md` §3.2, §4.1, §10.5, §10.6 — live codebase, authoritative for schema + revert flow
- `lib/db/schema/activity-entries.ts`, `workflows.ts`, `workflow-versions.ts`, `workflow-runs.ts` — live Drizzle schemas
- `lib/workflows/activity.ts`, `lib/workflows/approvals.ts` — existing write path patterns
- `lib/inngest/functions/execute-workflow-run.ts` — existing Inngest function for runNow triggering
- `components/chat/message-stream.tsx`, `inline-approval-card.tsx` — Realtime setAuth pattern (Phase 2)
- `supabase/migrations/0004_realtime_authz.sql` — Realtime RLS policy pattern to extend
- `Operator Zero Design Files/surface-workflows.jsx`, `surface-workflow-detail.jsx`, `surface-activity.jsx`, `components.jsx` — canonical UI contract

### Secondary (MEDIUM confidence)
- `npm view @tanstack/react-virtual version` → 3.13.25 [VERIFIED: npm registry]
- Phase 02 RESEARCH.md — established patterns + pitfalls carried forward

### Tertiary (LOW confidence — none)
No findings in this research rely solely on unverified sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed except @tanstack/react-virtual (registry-verified)
- Architecture: HIGH — follows live Phase 2 patterns exactly; no novel patterns
- Versioning pattern: HIGH — schema is live; transaction approach is standard Drizzle
- canRevert() logic: HIGH — DATA-FLOW.md §10.6 specifies it verbatim; implementation is a direct translation
- Realtime new channels: MEDIUM — migration 0004 is the precedent; new channel policies are additive; untested until first implementation
- Performance (ACT-07): MEDIUM — index strategy is sound; actual query timings depend on Supabase instance load

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (stable stack; no fast-moving dependencies)
