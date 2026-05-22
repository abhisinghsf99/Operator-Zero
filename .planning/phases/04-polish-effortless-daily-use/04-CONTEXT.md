# Phase 4: Polish — Effortless Daily Use - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes daily use **effortless** by completing the trust loop and the long tail of polish deferred from Phase 3. It delivers four clusters:

- **Approvals** (APRV-01…08) — the **Approval Inbox** (`/app/approvals`: list + detail, stakes-sorted, filter chips, batch triage, "All clear" empty state) and **full-fidelity inline approval cards** in Conversation. Both are two views of one approval row ("same queue, two doors"): approve/edit/reject/snooze from either, synced across surfaces (<5s), with the sidebar badge decrementing in real time. Includes stale/drift handling and inbox revert (≤24h).
- **Settings** (SET-02…08) — completing the Settings surface beyond Connections (already built in Phase 2): **Brand Voice** editor, **Autonomy Thresholds**, **"What I Remember About You"** (memory CRUD), **Profile**, **Sessions**, **Export & Delete**, and a **Notifications** placeholder.
- **Auth/Sessions** (AUTH-04, AUTH-05) — view active sessions (device, location, last-seen) with per-session revoke, and "sign out everywhere".
- **Mobile + Accessibility + Performance** (UX-01…04) — full **mobile parity** of all 5 core surfaces (no read-only stripping), **WCAG 2.1 AA** across all surfaces, and the **performance targets** from PRD §5.4.2.

**Already done (do NOT rebuild):**
- Approval **data layer + resolve path** — `approvals` table, `lib/workflows/approvals.ts` (`createApproval` with `expires_at = now + 14d`, `resolveApprovalRow` with ownership check), and `app/app/approvals/actions.ts` (`approveItem` already distinguishes `path: "inline" | "inbox"`, `rejectItem`). The L2 pause/resume keystone (`execute-workflow-run.ts` + `approval.resolved` event) is live from Phase 2.
- **Schema for Phase 4 settings** — `autonomy-thresholds.ts`, `brand-voice.ts`, `memory-items.ts`, `memory-embeddings.ts` all exist with RLS.
- **Settings Connections section** (SET-01) — `app/app/settings/page.tsx` + `_connections.tsx` + `actions.ts`.
- **Memory loop** — `lib/agent/memory.ts` (record/update/soft-delete + embeddings for recall).
- **Drift/revert** — `lib/workflows/revert.ts` `canRevert()` (Phase 3 D-11), reused for APRV-07 inbox revert.
- **Nav shell** — `components/layout/sidebar.tsx` + `bottom-tabs.tsx` (5-tab mobile bar already lists Approvals).

**What this phase ADDS:** the Approval Inbox surface + inline card UI; snooze/edit/bulk Server Actions + cross-surface sync; the Settings sections (voice/autonomy/memory/profile/sessions/danger); the autonomy-override gate enforcement; a session registry + export/delete flows; and the mobile-parity + a11y + performance pass across all surfaces.

**Out of scope (other milestones):** Meta/Instagram connection (v2), full notification surface (v2 NOTIF-01 — v1 ships badge + placeholder only), passkey/2FA, any new operational domain or surface.

</domain>

<decisions>
## Implementation Decisions

### Approval interactions (APRV)
- **D-01:** **Edit = inline-editable preview.** Clicking "Edit" makes the proposed content/value editable in place (inside the inline card and the Inbox detail) — content actions edit the text, structured actions (e.g. price) edit the value field. Sarah approves the edited version without leaving her current surface. NOT a bounce-to-chat.
- **D-02:** **Snooze = quick presets** (1 hour / this evening / tomorrow / pick a time). Snoozed items are hidden by default behind a toggle (APRV-06) and reappear at their return time sorted to the top.
- **D-03:** **Stale/drift handling.** On opening an approval, re-read the current underlying state. If it has drifted since the proposal (e.g. Sarah edited the product in Shopify), show a **"data changed since proposed" banner** and require **re-confirm before approve** (no one-tap approve on stale items). **Hard-expired approvals (created + 14d) auto-withdraw quietly** — no dumping stale items on her. Consistent with Phase 3's trust-first drift philosophy: never let her approve something different from what she reviewed without telling her.
- **D-04:** **Reject reason → agent memory.** The optional reject reason (APRV-02) is stored as a **durable memory item** (`lib/agent/memory.ts` + `memory-items`/`memory-embeddings`) so it influences future proposals via semantic recall, and surfaces/edits in "What I Remember" (SET-04).
- **D-04b:** **Inbox revert (APRV-07)** reuses `canRevert()` (`lib/workflows/revert.ts`, Phase 3 D-11) for recently-approved (≤24h) items; older reverts route to Activity.

### Autonomy thresholds (SET-03)
- **D-05:** **Override list is fixed and curated, mapped exactly to the v1 write-tool catalog (AGENT-03):** price, product status/retirement, redirects, inventory, send-customer-email, page/content. **Drop "discount codes"** (no v1 write tool) — no dead toggles. Not user-extensible in v1.
- **D-06:** **Overrides are one-directional — they only ADD friction.** A per-action override can force an approval (pausing even an L3 action), but can **never auto-approve** something a workflow would otherwise gate. The global setting only ever makes the agent *more* cautious.
- **D-07:** **The "default automation level for new workflows" applies to new workflows only.** Existing workflows retain their own level — no retroactive bulk level changes.
- **D-07b:** **Override enforcement lives in the workflow engine's L2/L3 decision** (`lib/inngest/functions/execute-workflow-run.ts`), before a write executes — consistent with the Phase 2 invariant that the engine, not `dispatchTool`, enforces the approval gate.

### Account lifecycle (SET-06/07, AUTH-04/05)
- **D-08:** **Export (SET-06) runs as a durable background Inngest job.** The request initiates in <60s; the job assembles JSON (workflows + versions + runs, activity, memory, brand voice), stores it in **Supabase Storage**, and surfaces a download link in-app (and/or email) when ready. Avoids Vercel function timeouts on large activity logs.
- **D-09:** **Delete account (SET-07) = lock-now, purge-at-7d.** On confirm: stop/abort the user's workflows, lock the account out, send email confirmation, and schedule hard delete at **+7 days**, **cancellable by signing back in** during grace. Initiation is **blocked while any workflow run is mid-execution**.
- **D-10:** **Sessions (AUTH-04/05) = our own session registry.** Record device/browser (from user-agent), **coarse location (IP geo, labeled approximate)**, and last-seen on login/activity. Per-session **revoke** invalidates that session; **"Sign out everywhere"** (with confirmation) revokes all sessions.

### Mobile, accessibility & performance (UX)
- **D-11:** **Two-pane surfaces collapse to drill-down navigation on mobile** (UX-01). Approvals (list + detail) and Settings (section-nav + content) show the list/nav first; tapping pushes a **full-screen detail with a back affordance**. No read-only stripping — every desktop action works on mobile.
- **D-12:** **Batch triage uses the select-mode toggle + bulk-action bar** pattern established in Phase 3 Activity (D-07) — touch-friendly, no hover dependency, keyboard/SR-accessible (APRV-03, UX-02/03). Reused for cross-surface consistency.
- **D-13:** **Inline card + Inbox adopt the design's keyboard model** — `A` approve / `R` reject / `E` edit / `S` snooze / `↑↓` next — plus text equivalents for the visualizer and cards (UX-03).

### Claude's Discretion (left to research + planning)
- **Brand Voice (SET-02):** markdown editor + live preview (design-locked); **"Regenerate from examples" produces a draft and confirms before replacing** current content (no silent overwrite); changes read fresh on the next agent action; stored encrypted at rest (security baseline).
- **Memory (SET-04):** inline edit/add; **delete is a soft-delete with a 24h recoverable window** surfaced via an undo toast (Sonner); categorized list per the design's `MemoryPanel`.
- **Notifications (SET-08):** render **only** the in-app sidebar badge + a "coming soon" placeholder — no non-functional toggles.
- **Cross-surface sync mechanism (APRV-05):** Realtime vs. poll left to research/planning (carried from Phase 3 discretion); target **<5s** cross-device, including sidebar badge decrement.
- **Performance (UX-04):** targets fixed (app shell <1.5s, surface nav <300ms, My Workflows <500ms p50); caching / RSC / index strategy to hit them is implementation discretion.
- **Stale re-validation read source** per `target_type` (Shopify mirror vs. live re-read) — follow Phase 3 `canRevert()`'s fresh-fetch approach.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI contract (canonical — locks layout & visual language)
- `Operator Zero Design Files/surface-approvals.jsx` — Approval Inbox: two-pane (380px list + detail), filter chips (All/High stakes/domain), `ApprovalRow` (select checkbox, stakes, age, domain), `ApprovalDetail` (reasoning, downstream-impact warning, preview, sticky action bar: Snooze/Reject/Edit/Approve + `A`/`R`/`E`/`S`/`↑↓` shortcuts), `ApprovalsEmpty` ("All clear" — no CTA, APRV-08).
- `Operator Zero Design Files/surface-conversation.jsx` ~L396–555 — `InlineApprovalCard` (FULL FIDELITY): pending/approved/rejected/snoozed/editing states, `ApprovalPreview`, action bar. This is the inline approval surface (APRV-04).
- `Operator Zero Design Files/surface-settings.jsx` — Settings: 240px section nav + content. `ConnectionsPanel` (built), `BrandVoicePanel` (markdown + preview + Save + Regenerate), `AutonomyPanel` (default `LevelToggle` + `ToggleRow` override list), `MemoryPanel` (categorized, edit/add), `ProfilePanel`, `SessionsPanel` (device/location/last-seen + revoke + "Sign out everywhere"), `DangerPanel` (export + delete).
- `Operator Zero Design Files/components.jsx`, `icons.jsx`, `data.jsx` — shared primitives (Button, Badge, Card, LevelToggle, StatusDot, SurfaceHeader, SectionHeader, StakesIndicator, Checkbox, Kbd, FilterChip, Avatar, Input) + `MEMORY`/`STORE` mock data shapes.

### Data model & critical-path flows
- `Docs/DATA-FLOW.md` — approval lifecycle (`createApproval` `expires_at = now+14d`), `approval.resolved` resume event, and **§10.6 drift / `canRevert()`** (content 7d / structural 24h / sent never; manually-edited-since blocks) reused for APRV-07. Check for any specced export/delete data flow.
- `Docs/Info Architecture.md` — locked 5-surface set + **mobile bottom-tab bar** (Workflows / Chat / Approvals / Activity / More); Settings lives under "More".
- `Docs/Operator Zero PRD.md` **§5.4.2** (performance targets — UX-04: app shell <1.5s, nav <300ms, My Workflows <500ms p50) and **§5.4.4** (drift rules source).
- `Docs/SYSTEMS-DESIGN.md` — web tier (stateless surfaces) vs. agent tier (durable Inngest) split; relevant for export-as-background-job and delete-purge scheduling.
- `Docs/TECH-SPEC.md` — v1 build plan + **write-tool catalog (AGENT-03)** that the autonomy override set (D-05) maps to.

### Live code (reuse / extend)
- `lib/workflows/approvals.ts` — `createApproval` / `resolveApprovalRow`; extend for snooze, edit, and bulk resolution.
- `app/app/approvals/actions.ts` — `approveItem(path: inline|inbox)` / `rejectItem`; extend with snooze, edit, bulk, and inbox-revert actions.
- `lib/inngest/functions/execute-workflow-run.ts` — L2 pause/resume engine; **autonomy-override gate (D-07b) enforced here**.
- `lib/agent/tools/write/index.ts` — write-tool gating point (level check).
- `lib/agent/memory.ts` + `lib/db/schema/memory-items.ts` + `memory-embeddings.ts` — reject-reason→memory (D-04) and "What I Remember" CRUD (SET-04).
- `lib/db/schema/autonomy-thresholds.ts` — autonomy override + default-level storage.
- `lib/db/schema/brand-voice.ts` — brand voice profile (SET-02).
- `app/app/settings/page.tsx` + `_connections.tsx` + `actions.ts` — Settings shell to extend with new sections.
- `lib/workflows/revert.ts` — `canRevert()` reused for APRV-07 (≤24h inbox revert).
- `components/layout/sidebar.tsx` + `bottom-tabs.tsx` — nav + approval badge (APRV-05 real-time decrement).

### Requirements, IA & success criteria
- `.planning/REQUIREMENTS.md` — APRV-01…08, SET-02…08, AUTH-04/05, UX-01…04 (full requirement text).
- `.planning/ROADMAP.md` — Phase 4 success criteria (70% approvals inline; mobile session ≥60% of desktop; "All clear" reached daily by 50%; WCAG 2.1 AA; perf targets).
- `.planning/phases/03-ownership-the-portfolio/03-CONTEXT.md` — D-07 select-mode pattern (reused), D-11 drift/`canRevert()` (reused), Realtime-vs-poll left to discretion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Approval resolve path is live (Phase 2):** `lib/workflows/approvals.ts` + `app/app/approvals/actions.ts` already create/resolve approvals and fire `approval.resolved` to resume the Inngest run. `approveItem` already takes `path: "inline" | "inbox"` — the dual-door wiring is anticipated. Phase 4 adds the UI + snooze/edit/bulk + sync.
- **Phase 4 settings schema exists:** `autonomy-thresholds`, `brand-voice`, `memory-items`, `memory-embeddings` tables already migrated with RLS — likely minimal new schema (verify columns for snooze timestamp, session registry, export-job/delete-grace state).
- **Memory loop (Phase 2):** `lib/agent/memory.ts` already does record/update/soft-delete + embeddings — reuse for reject-reason capture (D-04) and "What I Remember" CRUD.
- **Drift/revert (Phase 3):** `lib/workflows/revert.ts` `canRevert()` — reuse for APRV-07 without rebuilding.
- **Select-mode + bulk-bar (Phase 3):** the Activity multi-select pattern (D-07) ports directly to Approval batch triage (D-12).
- **Connections section (Phase 2/SET-01):** `app/app/settings/page.tsx` + `_connections.tsx` is the template for the new Settings sections.
- **Nav shell:** sidebar + bottom-tabs already list Approvals; the sidebar badge is the APRV-05 real-time decrement target.

### Established Patterns
- **Protected surfaces under `app/app/<surface>/`** — Approvals surface UI goes in `app/app/approvals/` (alongside the existing `actions.ts`).
- **Server Actions + Zod validation + `getClaims()` ownership re-check** — the approvals actions already model this (T-2-07-02); new snooze/edit/bulk/export/delete/session actions follow it.
- **Engine enforces the gate, not `dispatchTool`** (02-05) — autonomy overrides (D-06/D-07b) must be enforced in `execute-workflow-run.ts`.
- **Multi-tenant always:** every query filters by `user_id`; RLS enforces. Sessions, export, delete, memory all follow this.
- **Idempotency for external writes; observability-before-effect** — edited-then-approved actions and reverts emit Activity before the external write (WF-06).

### Integration Points
- **New UI:** `app/app/approvals/page.tsx` (+ list/detail components), inline-card wiring already referenced in `surface-conversation.jsx`, and new Settings section components under `app/app/settings/`.
- **New Server Actions:** `snoozeItem`, `editItem` (edit-then-approve), `bulkResolve` (atomic), `revertApproved`, plus `saveBrandVoice`/`regenerateBrandVoice`, `saveAutonomyThresholds`, memory CRUD, `exportAccountData` (→ Inngest), `requestAccountDeletion`/`cancelDeletion`, `revokeSession`/`signOutEverywhere`.
- **New Inngest functions:** `export-account-data` (assemble JSON → Storage), `purge-account` (scheduled +7d hard delete).
- **Session registry:** new write on login (device/UA, IP→coarse geo, last-seen) + revoke path; verify whether a `sessions` table is needed or Supabase Auth sessions suffice (research).
- **Cross-surface sync (APRV-05):** Realtime channel or poll updating Inbox + inline card + sidebar badge on resolve.

</code_context>

<specifics>
## Specific Ideas

- **"Empty is the goal state"** — the Approval Inbox "All clear" state has no task-y CTA (only a gentle "see what's been running" link); emptiness is celebrated, not a dead end (APRV-08).
- **"Same queue, two doors"** — inline (Conversation) and Inbox are two views of one approval row. Resolving in either updates the other and decrements the sidebar badge. One source of truth (APRV-05).
- **Honesty about staleness and drift carries over from Phase 3** — never let Sarah approve something different from what she reviewed without surfacing the change (D-03).
- **Mobile parity is *real* parity** — edit, batch triage, snooze, and revert all work on mobile; nothing is desktop-only (UX-01).
- **The global autonomy override is a safety net, not a remote control** — it can only tighten, never loosen (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Meta/Instagram connection in Settings** → v2 (render as a disabled "v2" badge per the design's `ConnectionRow` `soon` flag).
- **Full notification surface** (toast / email / push / in-app inbox) → v2 (NOTIF-01); v1 ships badge + "coming soon" placeholder only (SET-08).
- **Reject-reason behavioral influence beyond memory recall** (explicit proposal-suppression rules) → future tuning; v1 stores it as recallable memory (D-04).
- **Passkey / WebAuthn / 2FA** → not in v1 auth scope (AUTH-04/05 cover session visibility + revocation only).
- **User-extensible autonomy overrides** → considered and rejected for v1 (D-05 fixed set); revisit if the tool catalog grows.

None outside scope encountered — discussion stayed within the Phase 4 boundary.

</deferred>

---

*Phase: 4-polish-effortless-daily-use*
*Context gathered: 2026-05-22*
