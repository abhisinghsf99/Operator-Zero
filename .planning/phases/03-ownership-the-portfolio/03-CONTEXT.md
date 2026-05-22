# Phase 3: Ownership — The Portfolio - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes Sarah's workflow portfolio **visible, editable, and auditable**. It delivers the three "ownership" surfaces and the behaviors that make them trustworthy:

- **My Workflows** (`/app/workflows`) — the default landing surface: workflows grouped by status (Scheduled / Triggered / Manual / Paused / Drafts), a recent-activity strip + "what just happened" ticker, inline L1/L2/L3 toggle, pause/resume, "+ New workflow" (→ Conversation), and search.
- **Workflow Detail** (`/app/workflows/[id]`) — visual definition diagram, historical runs, inline-editable name/description/schedule/level, version history + restore, "Run Now", and "Open in Chat".
- **Activity log** (`/app/activity`) — chronological day-grouped timeline with filters, a detail panel (before/after diff + reasoning chain), single + atomic bulk revert subject to drift rules, and "Save as Workflow".

**Already done (Phase 2 — do NOT rebuild):** the entire data layer. `workflows`, `workflow_versions` (number, definition JSONB, 10-version retention), `workflow_runs`, and `activity_entries` (with `before_state` / `after_state` / `is_revertable` / `reverted_at` / `reverted_by_entry_id` / `target_type` / `target_id` / `reasoning_chain`) all exist with RLS. `lib/workflows/activity.ts` already writes entries with `is_revertable`. The sidebar already links `/app/workflows` and `/app/activity`. Realtime infra is wired (Phase 2 migration 0004 + `setAuth`).

**What this phase ADDS on top of that data layer:** the three route surfaces, inline-edit + versioning UI/Server Actions, the `canRevert()` drift function + revert/bulk-revert execution, "Run Now" trigger wiring, "Save as Workflow", and the default-landing flip.

**Out of scope (other phases):** Approval Inbox + full inline approval cards (Phase 4), full Settings (Phase 4), mobile detailed-design pass + accessibility hardening (Phase 4 — but build responsive, no read-only stripping). No new domains/surfaces.

</domain>

<decisions>
## Implementation Decisions

### Workflow Detail — editing
- **D-01:** Name & description use **click-to-edit inline** — click the text → editable field in place → blur/Enter saves (WF-11). No modal/drawer.
- **D-02:** Schedule editing uses a **lightweight structured picker** — frequency (hourly/daily/weekly/custom) + time-of-day. Sarah never writes cron. Complex trigger *logic* still goes through "Open in Chat".
- **D-03:** Each inline edit (name/description/schedule/level) **increments the workflow version** (WF-14) — every save snapshots a new `workflow_versions` row.

### Workflow Detail — versioning & runs
- **D-04:** Surface a **compact "Version history" panel** on Workflow Detail listing the last 10 versions (number, date, what changed) with a **"Restore"** action. Restore **creates a new version** (does not overwrite history) — directly satisfies WF-14 + success-criterion 5. (The design files have no version UI; this is an additive surface the requirements demand.)
- **D-05:** **"Run Now"** (WF-13) **confirms for write/L3 workflows** (one-tap dialog summarizing what it will do) and runs **instantly for read-only/manual** workflows. The triggered run appears in Historical Runs within seconds.
- **D-06:** **"Open in Chat"** (WF-12) opens a **scoped Conversation thread pre-loaded with the workflow's context** (reuses Phase 2's chat→workflow build path).

### Activity — revert, drift & bulk
- **D-07:** Multi-select uses a **"Select" mode toggle** in the Activity header → reveals row checkboxes + a bulk-action bar (keeps the default reading timeline calm). Works on touch (mobile-parity constraint) — no hover-only selection.
- **D-08:** **Bulk revert is atomic (all-or-none)** and shows a **confirmation modal that splits revertable vs blocked items with reasons** (drift/sent). If any selected item is blocked, Sarah chooses to proceed with only the revertable ones or cancel.
- **D-09:** **Disabled reverts** render as a **disabled button + accessible tooltip** explaining why (e.g. "sent emails can't be unsent", "out of 7-day window", "product edited since"). Keyboard- and screen-reader-accessible.
- **D-10:** **"Save as Workflow"** (ACT-06) **opens a scoped Conversation thread pre-loaded with the action's context** so the Orchestrator helps formalize it (consistent with "New workflow" = chat).
- **D-11:** Revert correctness is enforced by a shared **`canRevert(activityEntry)`** function used by **both the UI (show/hide/disable) and the Server Action (enforce)** — per DATA-FLOW.md §10.6. Drift windows: **content = 7d, structural = 24h, sent = never; "manually edited since" blocks revert.**

### Activity — filters & detail
- **D-12:** Filter UI = **quick level/result chips (kept) + a "Filter" popover** for workflow + date-range + result; all filters combine with **AND** (ACT-02). Active filters render as **removable pills**.
- **D-13:** Date-range filter = **presets (Today / 7d / 30d / All time) + a custom from–to picker**.
- **D-14:** Activity detail renders before→after as a **readable field-level diff** (old → new per field) from the existing `before_state`/`after_state` JSONB, alongside the reasoning chain (ACT-03).

### My Workflows — landing & strip
- **D-15:** All three recent-activity strip stats are **real in v1**: "Decisions outstanding" = live pending-approvals count; "Ran while you slept" = L3 actions in last 12h; **"Time saved this week" = a transparent per-action-type heuristic** (fixed minutes × action count) shown with an "estimated" label.
- **D-16:** **My Workflows is the default landing surface.** Bare `/app` and the existing `/app/home` **redirect to `/app/workflows`** (post-onboarding too). Keep `/app/home` as a thin redirect (or remove) so no links break. Success-criterion 2 + the "anti-dashboard" principle.
- **D-17:** **"Find a workflow"** search = **client-side fuzzy filter** over the loaded list (name/description/domain). Portfolio is small (5–20), so no server search.

### Claude's Discretion (left to research + planning)
- Data-fetching mechanism (Server Components + initial fetch vs. client query) and **Realtime vs. poll** for live updates ("Run Now appears in seconds", strip/approvals counts, activity stream).
- **Pagination / virtualization strategy** to hit ACT-07 (<1s p50 with 1,000+ entries) — cursor-based infinite scroll, page size, indexes.
- Exact `before_state`/`after_state` diff rendering per `target_type` (product vs. email vs. page).
- Whether `reasoning_chain` is read inline vs. fetched from `reasoning_chain_url` blob.
- The precise "time saved" minutes-per-action-type constants (a labeled estimate; tune from real data later).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI contract (canonical — locks layout & visual language)
- `Operator Zero Design Files/surface-workflows.jsx` — My Workflows: status grouping, recent-activity strip, "what just happened" ticker, WorkflowRow (LevelToggle, pause/resume, status dot), empty state.
- `Operator Zero Design Files/surface-workflow-detail.jsx` — Detail: breadcrumb, header actions, 5-stat bar, WorkflowDiagram, Historical-runs timeline. (NOTE: no version-history or inline-edit UI here — D-01/D-04 add them.)
- `Operator Zero Design Files/surface-activity.jsx` — Activity: filter chips, day-grouped timeline, ActivityDetail (details, reasoning chain, revert button + drift note). (NOTE: single revert only — D-07/D-08 add multi-select/bulk.)
- `Operator Zero Design Files/components.jsx`, `icons.jsx`, `data.jsx` — shared primitives (Button, Badge, Card, LevelToggle, StatusDot, SectionHeader, SurfaceHeader, ResultIndicator), icon set, and mock data shapes.

### Data model & critical-path flows
- `Docs/DATA-FLOW.md` §3.2 — `workflow_versions` shape (definition JSONB, schema_version, retention).
- `Docs/DATA-FLOW.md` §4.1 — `activity_entries` columns (before/after, is_revertable, reverted_*, target_*, reasoning_chain).
- `Docs/DATA-FLOW.md` §10.5 — **revert flow** (`revertActivity` Server Action: re-read state, write reverted state, insert `revert_*` entry, set original `reverted_at`).
- `Docs/DATA-FLOW.md` §10.6 — **drift rule check / `canRevert()`** (content 7d / structural 24h / sent never; manually-edited-since block). MUST be implemented as specced.
- `lib/db/schema/workflows.ts`, `lib/db/schema/workflow-versions.ts`, `lib/db/schema/workflow-runs.ts`, `lib/db/schema/activity-entries.ts` — live Drizzle schema (already migrated).

### Requirements, IA & success criteria
- `.planning/REQUIREMENTS.md` — WF-07…WF-14, ACT-01…ACT-08 (full requirement text).
- `.planning/ROADMAP.md` — Phase 3 success criteria (5 active workflows visible; 60% visit My Workflows 3×/wk; Activity <1s p50 @ 1000+; revert + drift + tooltip; versioning + restore).
- `Docs/Info Architecture.md` — locked surface set + workflow-first landing (Version A) + cross-surface wiring.
- `Docs/Operator Zero PRD.md` §5.4.2 (performance targets) and §5.4.4 (drift rules source).
- `Docs/SYSTEMS-DESIGN.md` — web tier (stateless, surfaces) vs. agent tier (durable, Inngest) split; relevant for "Run Now".
- `Docs/TECH-SPEC.md` — v1 build plan / tool catalog.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Full data layer (Phase 2):** `workflows`, `workflow_versions`, `workflow_runs`, `activity_entries` tables + RLS — no schema work expected beyond possibly a `revert_*` action_type convention and any index for `idx_activity_target` / date filters (verify per ACT-07).
- **`lib/workflows/activity.ts`** — already writes activity entries (sets `is_revertable`); reuse its insert path for `revert_*` entries.
- **`lib/workflows/approvals.ts`** — pending-approvals count for the strip's "Decisions outstanding" stat.
- **UI foundation (Phase 2, plan 02-01):** shadcn/ui + OKLCH tokens + fonts + app-shell. Design-file primitives (LevelToggle, StatusDot, Badge, Card, SurfaceHeader, ResultIndicator) map to existing/portable components.
- **`components/layout/sidebar.tsx` + `bottom-tabs.tsx`** — nav already lists Workflows + Activity (desktop + mobile tabs); just needs the routes to exist.
- **Inngest workflow execute function (`lib/inngest/functions/`)** — durable L1/L2/L3 engine from Phase 2; "Run Now" triggers it.
- **Realtime infra** — Phase 2 migration 0004 + client `setAuth` (channel authz already secured); reuse for live activity/strip/run updates if planning chooses Realtime.

### Established Patterns
- **Protected surfaces live under `app/app/<surface>/`** (chat, approvals, home, settings exist) — add `workflows/`, `workflows/[id]/`, `activity/` the same way.
- **Multi-tenant always:** every query filters by `user_id`; RLS enforces. Versioning/revert reads/writes follow this.
- **Idempotency for external writes:** revert execution (Shopify/Gmail) must be idempotent (retries inevitable).
- **Observability-before-effect:** revert emits an activity entry before the external write (WF-06 invariant).

### Integration Points
- **New routes:** `app/app/workflows/page.tsx`, `app/app/workflows/[id]/page.tsx`, `app/app/activity/page.tsx`.
- **New Server Actions:** `editWorkflow` (→ new version), `restoreVersion`, `runNow` (→ Inngest trigger), `revertActivity`, `bulkRevertActivity` (atomic), `saveAsWorkflow`.
- **Shared `canRevert()`** in a lib module (e.g. `lib/workflows/revert.ts`) consumed by both the Activity UI and the revert Server Actions (DATA-FLOW §10.6).
- **Default-landing redirect:** `middleware.ts` / app routing — `/app` and `/app/home` → `/app/workflows`; confirm onboarding completion routes there.

</code_context>

<specifics>
## Specific Ideas

- The "anti-dashboard" ethos governs My Workflows: it's a calm portfolio + "what just happened" narrative, not a metrics wall. Default reading views stay clean; power (multi-select, filters) is revealed on demand.
- "Time saved this week" must read as an **honest estimate** (labeled), never a hard claim.
- Bulk revert must be **honest about atomicity and drift** — show what will and won't revert before acting.
- Restore must **never destroy history** — it always creates a forward version.

</specifics>

<deferred>
## Deferred Ideas

- **Approval Inbox + full inline approval cards** — Phase 4 (APRV-01…08).
- **Full Settings** (Brand Voice editor, Autonomy Thresholds, "What I Remember", Profile, Sessions, Export/Delete) — Phase 4.
- **Mobile detailed-design pass + WCAG 2.1 AA hardening** — Phase 4 (this phase ships responsive + accessible-by-default, no read-only stripping).
- **Global search across surfaces** — v2 (this phase ships only client-side workflow search).
- **Server-side / large-scale workflow search** — not needed at v1 portfolio size; revisit if counts grow.

None of the above are in Phase 3 scope — discussion stayed within boundary.

</deferred>

---

*Phase: 3-ownership-the-portfolio*
*Context gathered: 2026-05-22*
