# Phase 3: Ownership — The Portfolio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 3-ownership-the-portfolio
**Areas discussed:** Detail (edit & versions), Revert (bulk & promote), Activity (filters & detail), Workflows (landing & strip)

---

## Workflow Detail — editing & versions

### Q: How should Sarah edit name & description?
| Option | Description | Selected |
|--------|-------------|----------|
| Click-to-edit inline | Click text → editable in place → blur/Enter saves (matches WF-11) | ✓ |
| Edit drawer/sheet | "Edit" button opens a side sheet with all fields | |
| Chat-only | All edits via "Open in Chat" | |

### Q: How does Sarah change the schedule?
| Option | Description | Selected |
|--------|-------------|----------|
| Structured picker | Frequency + time-of-day; no cron | ✓ |
| Natural language via chat | Read-only on Detail; change via chat | |
| Raw cron field | Text input accepting cron | |

### Q: How visible should versions be (WF-14)?
| Option | Description | Selected |
|--------|-------------|----------|
| Version history panel + restore | Last-10 list on Detail with Restore (creates new version) | ✓ |
| Current version badge only; restore via chat | Show "v7"; restore via chat | |
| Backend-only versioning | No restore UI this phase | |

### Q: "Run Now" confirmation behavior (WF-13)?
| Option | Description | Selected |
|--------|-------------|----------|
| Confirm for write/L3, instant for read | One-tap confirm for writes/L3; instant otherwise | ✓ |
| Always confirm | Every Run Now confirms first | |
| Always instant | No confirm | |

**User's choice:** all recommended options.
**Notes:** Inline edits increment the version (D-03); "Open in Chat" opens a scoped pre-loaded thread.

---

## Activity revert — bulk & promote

### Q: How does multi-select enter the Activity log (ACT-05)?
| Option | Description | Selected |
|--------|-------------|----------|
| "Select" mode toggle | Header toggle reveals checkboxes + bulk bar | ✓ |
| Always-visible checkboxes | Checkbox on every row always | |
| Hover/shift-click | Hover checkbox + shift-range (desktop-only) | |

### Q: What does Sarah see before atomic bulk revert?
| Option | Description | Selected |
|--------|-------------|----------|
| Confirm modal w/ revertable vs blocked split | Lists what reverts + what's blocked w/ reasons; all-or-none | ✓ |
| Simple count confirm | "Revert 6 actions?" minimal modal | |
| Immediate, toast to undo-window | Reverts instantly with toast | |

### Q: How are disabled reverts explained (ACT-04)?
| Option | Description | Selected |
|--------|-------------|----------|
| Disabled button + tooltip | Disabled button, accessible hover/focus tooltip with reason | ✓ |
| Inline reason text, no button | Muted line replacing the button | |

### Q: How does "Save as Workflow" work (ACT-06)?
| Option | Description | Selected |
|--------|-------------|----------|
| Opens scoped chat thread | Pre-loaded creation thread; Orchestrator formalizes it | ✓ |
| Instant draft workflow | Silent draft → Detail page | |
| Defer to Phase 4 | Ship without it | |

**User's choice:** all recommended options.
**Notes:** `canRevert()` shared by UI + Server Action (DATA-FLOW §10.6); drift = content 7d / structural 24h / sent never + manually-edited-since block.

---

## Activity log — filters & detail

### Q: How rich is the filter UI (ACT-02)?
| Option | Description | Selected |
|--------|-------------|----------|
| Keep chips + add filter popover | Quick chips + popover for workflow/date/result, AND-combined, removable pills | ✓ |
| Full filter bar replaces chips | Row of dropdowns | |
| Chips only, defer rich filters | Level/result chips only | |

### Q: Date-range filter?
| Option | Description | Selected |
|--------|-------------|----------|
| Presets + custom | Today/7d/30d/All + custom from–to | ✓ |
| Presets only | Fixed presets | |
| Custom picker only | from–to only | |

### Q: How is before→after rendered (ACT-03)?
| Option | Description | Selected |
|--------|-------------|----------|
| Field-level diff | Per-field old → new from before/after JSONB | ✓ |
| Side-by-side raw panels | Two raw columns | |
| Summary line only | action_summary only | |

**User's choice:** all recommended options.

---

## My Workflows — landing & strip

### Q: Which strip stats are real in v1?
| Option | Description | Selected |
|--------|-------------|----------|
| All three real; time-saved = simple heuristic | Approvals count + L3-last-12h + labeled time-saved estimate | ✓ |
| Two real, time-saved deferred | Placeholder for time-saved | |
| All three real; time-saved tuned later | Heuristic as a TODO constant | |

### Q: What happens to /app/home (default landing flip)?
| Option | Description | Selected |
|--------|-------------|----------|
| Redirect /app + /app/home → /app/workflows | My Workflows canonical; thin redirect/remove home | ✓ |
| Rename /app/home content into /app/workflows | Move role, drop home | |
| Keep /app/home as separate dashboard | Leave home as-is | |

### Q: What does "Find a workflow" search do in v1?
| Option | Description | Selected |
|--------|-------------|----------|
| Client-side filter over loaded list | Instant fuzzy filter (name/desc/domain) | ✓ |
| Stub the button (defer) | No-op/hide | |

**User's choice:** all recommended options.

---

## Claude's Discretion

- Data-fetching mechanism + Realtime-vs-poll for live updates.
- Pagination/virtualization to hit ACT-07 (<1s p50 @ 1000+ entries).
- Per-`target_type` diff rendering; inline `reasoning_chain` vs. blob fetch.
- The exact "time saved" minutes-per-action-type constants.

## Deferred Ideas

- Approval Inbox + full inline approval cards — Phase 4.
- Full Settings — Phase 4.
- Mobile detailed-design pass + WCAG AA hardening — Phase 4.
- Global / server-side search — v2.
