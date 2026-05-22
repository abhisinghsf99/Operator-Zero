/**
 * lib/workflows/grouping.ts
 * Status-grouping pure function for the My Workflows surface (WF-07).
 *
 * groupWorkflowsByStatus — takes a flat list of workflows and partitions them
 *   into the five status buckets the My Workflows page displays:
 *
 *   scheduled — active workflows with trigger_type = 'schedule'
 *   triggered — active workflows with trigger_type = 'event'
 *   manual    — active workflows with trigger_type = 'manual' (or unknown)
 *   paused    — paused workflows (any trigger_type)
 *   drafts    — draft + archived + any other non-active/non-paused status
 *
 * This is a pure function — no DB or server dependencies. Safe to use
 * in both Server Components and client components.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
  automation_level: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown;
}

export interface GroupedWorkflows {
  /** Active workflows with trigger_type = 'schedule' */
  scheduled: WorkflowSummary[];
  /** Active workflows with trigger_type = 'event' */
  triggered: WorkflowSummary[];
  /** Active workflows with trigger_type = 'manual' (or unrecognized trigger) */
  manual: WorkflowSummary[];
  /** Paused workflows (any trigger type) */
  paused: WorkflowSummary[];
  /** Draft, archived, or any other non-active/non-paused status */
  drafts: WorkflowSummary[];
}

// ─── groupWorkflowsByStatus ───────────────────────────────────────────────────

/**
 * groupWorkflowsByStatus — partition workflows into My Workflows display buckets.
 *
 * Bucket logic:
 *   - status === 'paused'  → paused  (checked before trigger_type)
 *   - status === 'active' + trigger_type === 'schedule' → scheduled
 *   - status === 'active' + trigger_type === 'event'    → triggered
 *   - status === 'active' + trigger_type === 'manual'   → manual
 *   - status === 'active' + unknown trigger_type        → manual (fallback)
 *   - any other status (draft, archived, etc.)          → drafts
 *
 * @param workflows - Flat list of workflow objects (full or partial shape)
 * @returns GroupedWorkflows with five status buckets
 */
export function groupWorkflowsByStatus(
  workflows: WorkflowSummary[]
): GroupedWorkflows {
  const result: GroupedWorkflows = {
    scheduled: [],
    triggered: [],
    manual: [],
    paused: [],
    drafts: [],
  };

  for (const wf of workflows) {
    if (wf.status === "paused") {
      result.paused.push(wf);
    } else if (wf.status === "active") {
      if (wf.trigger_type === "schedule") {
        result.scheduled.push(wf);
      } else if (wf.trigger_type === "event") {
        result.triggered.push(wf);
      } else {
        // 'manual' trigger or any unrecognized trigger → manual bucket
        result.manual.push(wf);
      }
    } else {
      // draft, archived, or any other status → drafts bucket
      result.drafts.push(wf);
    }
  }

  return result;
}
