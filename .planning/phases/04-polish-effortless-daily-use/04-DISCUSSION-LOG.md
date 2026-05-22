# Phase 4: Polish — Effortless Daily Use - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 4-polish-effortless-daily-use
**Areas discussed:** Approval interactions, Autonomy thresholds, Account lifecycle, Mobile adaptation

---

## Approval interactions

### Edit flow — what "Edit" does to a proposed action

| Option | Description | Selected |
|--------|-------------|----------|
| Inline-editable preview | Preview content/value becomes editable in place; approve in one surface; structured actions edit the value field | ✓ |
| Open in Chat to revise | Bounce to a scoped Conversation thread to revise with the agent, then re-propose | |
| Structured field form | Focused edit form tailored per action type | |

**User's choice:** Inline-editable preview

### Snooze model

| Option | Description | Selected |
|--------|-------------|----------|
| Quick presets | 1h / this evening / tomorrow / pick a time; hidden until return, reappears at top | ✓ |
| Single fixed snooze | One "Snooze" = fixed window (e.g. 4h) | |
| Snooze until I clear it | Hide behind toggle, no auto-return | |

**User's choice:** Quick presets

### Stale / drifted approvals (APRV-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Re-validate + flag stale | Re-read on open; drift → "data changed" banner + require re-confirm; 14d hard-expiry auto-withdraws | ✓ |
| Auto-withdraw & re-propose | Silently withdraw stale/expired; workflow re-proposes against current state | |
| Approve against latest | Approve always applies to current state (agent re-reads at execution) | |

**User's choice:** Re-validate + flag stale

### Reject reason → future proposals (APRV-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Store as agent memory | Reason becomes a durable memory item; agent recalls it; visible in "What I Remember" | ✓ |
| Log only (no feedback in v1) | Capture on the record for audit, no behavioral influence | |
| Attach to the workflow | Save as a note on the parent workflow's context | |

**User's choice:** Store as agent memory

**Notes:** Edit applies to both the inline card (Conversation) and the Inbox detail. APRV-07 inbox revert (≤24h) reuses Phase 3's `canRevert()`.

---

## Autonomy thresholds

### Per-action override list — fixed vs extensible (SET-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed, mapped to v1 tools | Curated fixed set mapped to the v1 write-tool catalog; drop "discount codes" (no v1 tool) | ✓ |
| Fixed list as designed | Ship the 6 toggles literally, incl. "discount codes" as a disabled placeholder | |
| User-extensible | Sarah can add an override for any supported action type | |

**User's choice:** Fixed, mapped to v1 tools

### Precedence — how an override interacts with a workflow's level

| Option | Description | Selected |
|--------|-------------|----------|
| Overrides only add friction | Can force an approval (pause L3) but never auto-approve past a workflow gate | ✓ |
| Bidirectional | Can both force approval and auto-approve | |

**User's choice:** Overrides only add friction

### Scope of "default level for new workflows"

| Option | Description | Selected |
|--------|-------------|----------|
| New workflows only | Applies to workflows created after the change; existing keep their level | ✓ |
| New + offer to apply retroactively | Plus a one-time "apply to existing too?" prompt | |

**User's choice:** New workflows only

**Notes:** Override gate enforced in the workflow engine (`execute-workflow-run.ts`), consistent with the Phase 2 invariant that the engine (not `dispatchTool`) enforces approvals.

---

## Account lifecycle

### Data export (SET-06, <60s init)

| Option | Description | Selected |
|--------|-------------|----------|
| Background job + link | Durable Inngest job → JSON → Supabase Storage → download link in-app/email | ✓ |
| Synchronous download | Generate on-request and stream immediately | |

**User's choice:** Background job + link

### Delete account 7-day grace (SET-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Lock now, purge after 7d | Stop workflows + lock + email confirm; hard delete at +7d; cancel by signing back in | ✓ |
| Active during grace, purge at day 7 | Account stays usable for 7 days with banner + cancel | |

**User's choice:** Lock now, purge after 7d

### Session data fidelity (AUTH-04/05)

| Option | Description | Selected |
|--------|-------------|----------|
| Real, coarse location | Own session registry: device from UA, coarse IP location (labeled approximate), last-seen; per-session revoke | ✓ |
| Real device, no location | Reliable device + last-seen; omit/approximate location | |
| Lean on Supabase sessions | Use whatever Supabase Auth exposes as-is | |

**User's choice:** Real, coarse location

---

## Mobile adaptation

### Two-pane collapse on mobile (UX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Drill-down navigation | List/nav first; tap pushes full-screen detail with back; nothing stripped | ✓ |
| Bottom-sheet detail | List stays; detail slides up as a bottom sheet | |
| Responsive reflow | Stack panes vertically | |

**User's choice:** Drill-down navigation

### Batch triage multi-select on touch (APRV-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Select-mode toggle + bulk bar | Reuse Phase 3 Activity pattern (D-07); touch-friendly, accessible | ✓ |
| Swipe gestures | Swipe-to-approve/reject + select-mode for bulk | |

**User's choice:** Select-mode toggle + bulk bar

---

## Claude's Discretion

- **Brand Voice (SET-02):** markdown editor + live preview; "Regenerate from examples" drafts and confirms before replacing (no silent overwrite); reads fresh next agent action; encrypted at rest.
- **Memory (SET-04):** inline edit/add; soft-delete with 24h undo (Sonner toast).
- **Notifications (SET-08):** in-app badge + "coming soon" placeholder only — no dead toggles.
- **Cross-surface sync (APRV-05):** Realtime vs poll left to research (carried from Phase 3); target <5s.
- **Performance (UX-04):** targets fixed; caching/RSC/index strategy is implementation discretion.
- **Stale re-validation read source** per `target_type` — follow Phase 3 `canRevert()` fresh-fetch approach.

## Deferred Ideas

- Meta/Instagram connection in Settings → v2.
- Full notification surface (toast/email/push/inbox) → v2 (NOTIF-01).
- Reject-reason behavioral influence beyond memory recall → future tuning.
- Passkey / WebAuthn / 2FA → not in v1 auth scope.
- User-extensible autonomy overrides → rejected for v1; revisit if tool catalog grows.
