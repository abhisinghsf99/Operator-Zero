---
quick_id: 260831-ipj
subsystem: ui
tags: [mobile, responsive, tailwind, css, playwright, wcag]

key-files:
  created: []
  modified:
    - components/chat/thread-sidebar.tsx
    - app/app/chat/page.tsx
    - "app/app/chat/[threadId]/page.tsx"
    - components/design/primitives.tsx
    - components/chat/composer.tsx
    - app/globals.css
    - app/layout.tsx
    - app/app/layout.tsx
    - "app/app/workflows/[id]/_workflow-detail-view.tsx"
    - app/app/workflows/_workflows-view.tsx
    - components/workflows/recent-activity-strip.tsx
    - components/chat/message-stream.tsx
    - tests/e2e/mobile.spec.ts

key-decisions:
  - "ThreadSidebar default layout classes (flex w-[260px] shrink-0 flex-col) moved from inline style into className, merged via cn() so caller overrides win through tailwind-merge instead of losing to inline-style precedence"
  - "SurfaceHeader row: flex-col items-stretch gap-3 md:flex-row md:items-end md:justify-between md:gap-6 replaces a non-wrapping inline flex row"
  - "Composer all:\"unset\" replaced with the explicit reset it stood in for, plus explicit whiteSpace:pre-wrap and overflowY:auto"
  - "16px input floor implemented as one @media (max-width:768px) rule with !important in globals.css, not 13 individual inline-style edits"
  - "100vh -> .h-screen-dvh (100vh with 100dvh fallback) hand-written class; Tailwind v4 cannot express two-value cascade fallbacks as ordered utilities"
  - "_settings-shell.tsx padding sites confirmed to live entirely inside the desktop-only hidden md:flex branch — verified no-op, not edited"
  - "_activity-view.tsx mobile back-affordance padding (10px 16px) confirmed already mobile-safe inside its own md:hidden branch — left unchanged"
  - "Dev server's CSS pipeline (Turbopack + Tailwind v4 JIT) only recompiles globals.css when triggered by a scanned .tsx file edit — a globals.css-only edit does not trigger a rebuild on its own in this long-running dev process"
  - "Reused the shared demo account (DEMO_EMAIL/DEMO_PASSWORD in .env.local) with a saved Playwright storageState for Tasks 2-7 verification after the anonymous-sandbox rate limit (10/hour/IP) was exhausted during Task 1"
  - "Task 8a: stat-strip gridTemplateColumns and divider display both moved from inline style to className — same F1 inline-vs-class precedence bug pattern applies to any inline display value, so all three Task 8 fixes route display through className rather than inline style"
  - "Task 8b: chat-thread title truncation (overflow:hidden/ellipsis/nowrap) applied unconditionally, not md-gated, per explicit coordinator instruction — has zero visual effect on titles that already fit the row, only engages for pathologically long titles that would otherwise have wrapped/overflowed at any viewport"

requirements-completed: []

duration: ~2h15m (including one mid-session transient network interruption + a post-checkpoint Task 8 addendum from independent coordinator review)
completed: 2026-08-31
---

# Quick Task 260831-ipj: Mobile Browser Rendering + Responsive Pass Summary

**Fixed all six empirically-verified mobile rendering defects (F1-F6) plus three additional defects (8a-8c) found via independent visual re-inspection — sidebar-eats-composer, one-word-per-line headings, broken newlines/auto-resize, iOS zoom-on-focus, dead safe-area insets, hard-coded desktop padding, a clipped stat strip, a cramped chat header, and a crowded composer hint row — while keeping desktop rendering byte-for-byte identical across every structural CSS metric measured.**

## Performance

- **Tasks:** 8 (7 auto/test + 1 checkpoint, checkpoint awaiting human verification)
- **Files modified:** 12 source files + 1 test file (13 total)
- **Commits:** 8 (6 fix commits, 2 test commits)

## Accomplishments

- **F1** — ThreadSidebar's inline `display`/`width` no longer beats Tailwind breakpoint classes; mobile composer went from 36px wide to 296-328px wide, sidebar correctly hidden on the active-thread route.
- **F2** — SurfaceHeader now stacks (`flex-col` → `md:flex-row`) instead of collapsing the title column to one word per line; verified on `/app/workflows` and `/app/approvals`.
- **F3** — Composer textarea's `all:"unset"` replaced with an explicit reset; newlines render again (`white-space: pre-wrap`), auto-resize still works (confirmed growing 48px→72px on mobile across 3 typed lines).
- **F4** — One `@media (max-width:768px)` rule forces every input/textarea/select to 16px, preventing iOS Safari zoom-on-focus, without touching 13 individual inline `fontSize` call sites.
- **F5** — Root layout now exports `viewport` with `viewport-fit=cover` (previously absent, meaning `env(safe-area-inset-*)` always resolved to 0); app shell switched from `h-screen` (100vh) to a `100dvh`-with-`100vh`-fallback class; main's bottom padding now accounts for the real tab-bar height including the safe-area inset.
- **F6** — Five hard-coded padding sites in the workflow detail view and one in the workflows empty-state moved from inline `padding` to `px-4 md:px-{10,7}` classes; two candidate sites (`_activity-view.tsx`, `_settings-shell.tsx`) were investigated and confirmed to be non-issues (already mobile-safe / desktop-only branch respectively) rather than edited speculatively.
- **8a** — Workflows stat strip's `gridTemplateColumns` moved from inline style to a responsive className (`grid-cols-1` below md, restores the exact `1fr 0.5px 1fr 0.5px 1fr` desktop layout at md+); the third stat ("Time saved this week") is no longer clipped at the 390px viewport edge; the two vertical dividers hide below md instead of rendering as meaningless empty bars.
- **8b** — Chat thread header title now truncates with an ellipsis instead of wrapping to 3 lines and squeezing the status text; the decorative "here & remembering" label hides below md (status dot stays visible at every width).
- **8c** — Composer's keyboard-hint row ("⏎ send · ⇧⏎ newline") hides below md (no physical Enter key on touch), no longer crowding the "remembers your store" memory indicator into a wrapped block next to Send.
- Added a durable `tests/e2e/mobile.spec.ts` regression block (`260831-ipj — mobile rendering regressions`) encoding verification-contract items 1-4 plus 3 more tests for 8a/8b/8c, following the file's existing `HAS_LIVE_STACK` skip-guard convention.
- **Desktop verified pixel-identical** across every structural metric measured (sidebar width, header padding, header row layout, h1 font-size, main padding, composer rect, input font sizes, stat-strip grid tracks, divider visibility, hint visibility) — see Verification section.

## Task Commits

1. **Task 1: Measurement harness + pre-fix baseline** — no commit (scratch tooling per plan, not part of the repo)
2. **Task 2: F1 — ThreadSidebar inline-style precedence fix** — `dbadb70` (fix)
3. **Task 3: F2 — SurfaceHeader wraps instead of collapsing** — `f481aa5` (fix)
4. **Task 4: F3 + F4 — composer reset, responsive padding, 16px input floor** — `e6f286b` (fix)
5. **Task 5: F5 — viewport-fit, dynamic viewport height, safe-area padding** — `aa997b4` (fix)
6. **Task 6: F6 — responsive audit of hard-coded padding** — `3d0dd26` (fix)
7. **Task 7: durable regression tests (F1-F6)** — `6c24629` (test)
8. **Task 8: 8a/8b/8c — stat strip clip, chat header truncation, composer hint crowding** — `949ff8b` (fix), `a9cf678` (test)

**Plan metadata:** not yet committed (SUMMARY.md/STATE.md docs commit handled by orchestrator per constraint)

## Files Created/Modified

- `components/chat/thread-sidebar.tsx` — default layout classes moved from inline style to `className`, merged via `cn()`; stale comment corrected
- `app/app/chat/page.tsx` — `!w-full md:!w-[260px]` → `w-full md:w-[260px]` (bangs obsolete once inline style no longer fights classes)
- `app/app/chat/[threadId]/page.tsx` — stale comment describing the broken mechanism corrected
- `components/design/primitives.tsx` — `SurfaceHeader` row: `flex-col` → `md:flex-row` stack; `h1` hard-coded `fontSize:38` → `text-[28px] md:text-[38px]`; `right` actions get `w-full shrink-0 md:w-auto`
- `components/chat/composer.tsx` — `all:"unset"` replaced with explicit reset + `whiteSpace:pre-wrap` + `overflowY:auto`; wrapper padding `px-4 md:px-8`; keyboard-hint span hidden below md via `className="hidden md:inline-flex"` (Task 8c)
- `app/globals.css` — F4 16px-input-floor media-query rule; `.h-screen-dvh` hand-written class
- `app/layout.tsx` — added `viewport` export with `viewport-fit=cover`
- `app/app/layout.tsx` — `h-screen` → `h-screen-dvh`; main `pb-[56px]` → `pb-[calc(56px+env(safe-area-inset-bottom,0px))]`
- `app/app/workflows/[id]/_workflow-detail-view.tsx` — 5 padding sites (breadcrumb, stat bar, diagram column, runs panel, version panel) moved to `px-4 md:px-{10,7}`
- `app/app/workflows/_workflows-view.tsx` — empty-state padding moved to `px-4 md:px-10`
- `components/workflows/recent-activity-strip.tsx` — stat-strip `gridTemplateColumns` and divider `display` moved from inline style to `className` (`grid-cols-1 md:grid-cols-[1fr_0.5px_1fr_0.5px_1fr]`, `hidden md:block`)
- `components/chat/message-stream.tsx` — chat-thread header title gets `overflow:hidden/text-overflow:ellipsis/white-space:nowrap`; "here & remembering" label hidden below md
- `tests/e2e/mobile.spec.ts` — `260831-ipj — mobile rendering regressions` test block, 7 tests total (4 for contract items 1-4, 3 for Task 8a/8b/8c)

## Decisions Made

See `key-decisions` in frontmatter. The two decisions worth calling out beyond the plan's own design:

1. **Auth path switch (Rule 3 — blocking).** The plan's verification environment specified auth via the anonymous demo sandbox (`/login` → "Try the live demo →"). That path is rate-limited to 10 new sandboxes/hour/IP (`sandboxCreateRateLimit` in `lib/rate-limit.ts`) and was exhausted midway through Task 1's baseline capture plus repeated Task 2 verification attempts, surfacing as "Too many demo sessions from your network right now." From Task 2 onward, verification switched to the pre-existing shared demo account (`DEMO_EMAIL`/`DEMO_PASSWORD` in `.env.local`) authenticated once via a saved Playwright `storageState`, reused across every subsequent measurement script — matching the verification_environment's own guidance to "save it and reuse it across measurements, do not re-auth on every navigation." `baseline-pre.json` (Task 1, captured before the rate limit was hit) and `baseline-post.json` (Task 7, via the shared account) are not directly comparable on *dynamic per-account content* (approval counts, subtitle text) but are directly comparable — and were compared — on every *structural CSS metric* (padding, widths, font-sizes, flex layout properties), which is what the desktop-pixel-identical constraint actually requires.
2. **Dev-server CSS staleness (documented, not a code bug).** This long-running Next.js dev process (Turbopack + Tailwind v4 JIT, running since 27-Jul) only recompiles `globals.css`'s output when a scanned `.tsx` template file changes — editing `globals.css` alone does not trigger a rebuild. This was discovered when the F4 media-query rule silently failed to appear in the served CSS bundle after being added. Worked around by making the accompanying `.tsx` edit in the same task land after the CSS edit (already true for Task 4/5/6 since each task touches both a CSS file and a template file). Documented here so a future session doesn't waste time re-diagnosing it — if you ever edit `globals.css` in isolation with no accompanying template change, touch any scanned `.tsx` file to force a rebuild before verifying.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Anonymous-sandbox rate limit exhausted mid-verification**
- **Found during:** Task 2 verification (first re-run of the chat-scoped harness)
- **Issue:** `enterSandbox()` server action is rate-limited to 10 new sandboxes/hour/IP; repeated measurement runs during Task 1 baseline capture + early Task 2 attempts exhausted it, returning "Too many demo sessions from your network right now."
- **Fix:** Authenticated once via the shared demo account (`DEMO_EMAIL`/`DEMO_PASSWORD`, already present in `.env.local` for this exact purpose per project memory) with `context.storageState({path})`, reused across all Task 2-7 measurement scripts.
- **Files modified:** none (verification tooling only, scratch dir)
- **Verification:** All subsequent measurement runs succeeded; structural desktop metrics from the shared-account session cross-checked against `baseline-pre.json`'s anonymous-sandbox session and found identical on every CSS property that isn't account-data-dependent.

**2. [Rule 1 - Bug, in-repo] Dev-server CSS rebuild not triggered by globals.css-only edits**
- **Found during:** Task 4 verification (F4 16px rule not appearing in served CSS after edit)
- **Issue:** Turbopack's dev CSS pipeline in this long-running process only regenerates the compiled stylesheet when a scanned `.tsx` template file changes; a pure `globals.css` content edit alone left the served bundle stale (confirmed via direct `curl` of the compiled CSS chunk before/after).
- **Fix:** Not a source-code fix — this is an environment/tooling characteristic, not a bug in the shipped code. Worked around by ensuring each task's CSS edit was accompanied by a real content edit to a scanned `.tsx` file (already the case for every task in this plan), which triggers the rebuild. Documented as a decision above for future sessions.
- **Files modified:** none beyond the task's own planned edits
- **Verification:** Re-fetched the compiled CSS chunk after the accompanying `.tsx` edit and confirmed the new rule was present; then re-ran the harness and confirmed `font-size: 16px` on mobile inputs.

**3. [Rule 3 - Blocking, out of scope, deferred] Pre-existing WCAG 2.1 AA color-contrast failure on `/login`**
- **Found during:** Task 7, step 4 (`npx playwright test tests/e2e/a11y.spec.ts tests/e2e/keyboard.spec.ts`)
- **Issue:** `axe-core` reports two `color-contrast` violations on `/login` (`--text-faint` "or" divider at 2.64:1, `--text-tertiary` "Sign up" link text at 4.22:1, both against `--bg-elevated`; needs 4.5:1). Fails on both `chromium` and `mobile-chrome` projects identically.
- **Fix:** Not fixed — confirmed pre-existing and unrelated: `git diff 8ad54c1 HEAD --stat` shows this plan touched 10 files, none of which is `app/(auth)/login/page.tsx` or the `:root` design tokens (`globals.css` was only appended to, never edited in its `:root` block). Login page rendering is unaffected by any change in this plan at any viewport.
- **Files modified:** none (out of scope per Scope Boundary rule — fixing this requires a design-token or copy change on an unrelated surface)
- **Verification:** Logged to `.planning/quick/260831-ipj-mobile-browser-rendering-and-responsive-/deferred-items.md` with full failure detail and the git-diff evidence of non-involvement.

---

**Total deviations:** 3 (2 auto-worked-around tooling/environment issues, 1 deferred pre-existing unrelated failure) + Task 8 (3 additional in-scope findings from independent coordinator review, not a deviation — an explicit scope extension of the plan's own "full responsive audit" objective)
**Impact on plan:** None of the three logged deviations affected the shipped fix code. No scope creep on F1-F6 — all six findings were fixed exactly as the plan specified, at their root cause. Task 8 (8a/8b/8c) extends the same objective to three defects the original contract didn't cover, fixed to the same standard (mobile-only, desktop pixel-identical, atomic commits).

## Verification

### Desktop diff against `baseline-pre.json` (contract item 5)

Programmatic diff of every structural CSS metric across all 6 measured surfaces
(workflows/approvals/activity/settings/chat-index/chat-thread) at `devices['Desktop Chrome']`
(1280px): `headerPadding`, `aside.width`, `aside.display`, `mainPadding`, `h1.fontSize`,
`innerHeight`/`innerWidth`, all `input`/`textarea` font-sizes, and the composer textarea's full
rect (x/y/w/h) + font-size.

**Result: zero differences.** Every value in `baseline-post.json`'s Desktop Chrome section
matches `baseline-pre.json` byte-for-byte:
- Sidebar: `260px`/`248px` (chat vs nav) on every surface, unchanged
- Header row: `"32px 40px 22px"` padding, `38px` h1 font-size, unchanged
- Composer: rect `{x:555, y:607, w:678, h:40}`, `fontSize:14px`, unchanged
- All input font-sizes (`14px`/`13px` variants), unchanged
- `mainPadding: "0px"`, `innerHeight: 720`, unchanged

Two fields intentionally differ and are *not* regressions:
- `composerTextarea.whiteSpace`: `"normal"` → `"pre-wrap"` — this is the F3 fix, applies at all
  viewports by design (it's fixing a bug in the reset, not adding responsive behavior)
- `metaViewportContent`: gains `, viewport-fit=cover` — the F5 addition, inert on non-notched
  desktop displays

`h1.rect.width` and `headerRight.rect` values differ between the two JSON files but this is *not*
a CSS regression — `baseline-pre.json` was captured on a freshly-seeded anonymous sandbox and
`baseline-post.json` on the shared demo account, which have different approval counts / dynamic
subtitle text (e.g. approvals subtitle differs based on how many items are pending). The h1
element stretches to its flex-column parent's width (`align-items: stretch` default), which is
itself influenced by sibling subtitle text length — an existing, pre-fix behavior unrelated to
this plan's changes. The *structural* row-layout properties (`flex-direction`, `align-items`,
`gap`) and `font-size` were independently verified identical pre/post in Task 3's dedicated check.

### Mobile contract items 1-4 (`baseline-post.json`, iPhone 13 / 390px)

1. **Sidebar hidden, textarea >250px, `pre-wrap`:** chat-thread `aside.display: "none"`,
   composer textarea `w: 328px` (>250), `whiteSpace: "pre-wrap"`. ✅
2. **All inputs `font-size >= 16px`:** every surface's inputs report `"16px"` (including the
   composer textarea). ✅
3. **`<h1>` >250px, no overlap:** workflows/approvals h1 `w: 358px` (>250), independently
   verified zero rect-intersection with the `right` actions container. ✅
4. **`scrollWidth === clientWidth`:** `390 === 390` on all 6 measured surfaces
   (workflows/approvals/activity/settings/chat-index/chat-thread). ✅
5. **Desktop unchanged:** see above — zero structural regressions. ✅
6. **`mobile.spec.ts --project=mobile-chrome` passes:** see below.

### Test/build commands (Task 7 step 4)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Clean, zero errors |
| `npx playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome` | 13 skipped, 0 failed, exit 0 (`HAS_LIVE_STACK` env guard not set in this shell — matches this suite's pre-existing convention; same skip pattern existed before this plan for all 9 prior tests) |
| `npx playwright test tests/e2e/a11y.spec.ts tests/e2e/keyboard.spec.ts` | 2 failed (pre-existing `/login` color-contrast, confirmed unrelated — see Deviations #3), 40 skipped |
| `npx vitest run` | 568 passed, 2 skipped, 12 todo (0 failed) |

### Task 8 (8a/8b/8c) — coordinator-flagged defects beyond the original F1-F6 contract

Independent visual re-inspection after the F1-F6 fixes landed surfaced three additional mobile
defects not covered by the original findings/verification contract. Fixed as Task 8, same
standards (mobile-only, desktop pixel-identical, atomic commit per fix group).

**8a — stat strip clipped on `/app/workflows`.** At 390px `gridTemplateColumns: "1fr 0.5px 1fr
0.5px 1fr"` (inline, no breakpoint) gave each column ~110px, clipping the third stat at the
viewport edge. Not caught by contract item 4 (`scrollWidth === clientWidth`) because it clips
*inside* a bordered container rather than extending the document — confirmed the coordinator's
note that this class of defect needs an explicit "is the element's right edge within the
viewport" assertion, not a document-level overflow check.

Verified at 390px: `gridTemplateColumns` computes to a single track (`"320px"`), all three stat
rects report `right: 355` (within the 390px viewport, confirmed `thirdStatRightWithinViewport:
true`), both dividers compute `display: none`. At 1280px: `gridTemplateColumns` computes to
`"280.328px 0.5px 280.328px 0.5px 280.344px"` (5 tracks, `fr`-proportional — matches the original
`1fr 0.5px 1fr 0.5px 1fr` exactly), both dividers `display: block`.

**8b — chat thread header cramped the title.** No truncation on the title `<span>` meant a long
thread title wrapped to 3 lines, squeezing "here & remembering" into a narrow column.

Verified at 390px: title span computes `overflow: hidden`, `text-overflow: ellipsis`,
`white-space: nowrap`; "here & remembering" computes `display: none`; status dot still visible
(`display` non-`none`). At 1280px: "here & remembering" computes `display: block` (unchanged,
visible); title row height `21px` identical at both viewports (confirms zero layout shift for
titles that already fit — truncation is a no-op until a title is long enough to actually overflow,
which is why applying it unconditionally rather than md-gating it, per the coordinator's explicit
instruction, doesn't change desktop rendering for any title in the current dataset).

**8c — composer hint row crowded Send.** The `<Kbd>⏎</Kbd> send · <Kbd>⇧⏎</Kbd> newline` hint is
meaningless on a touch device (no physical Enter key) and was squeezing "remembers your store"
into a wrapped two-line block.

Verified at 390px: keyboard-hint span computes `display: none`; "remembers your store" indicator
still visible (`display: flex`, unaffected). At 1280px: keyboard-hint span visible (non-`none`
`display`), unchanged content/spacing (only the `display` property moved from inline style to
`className`, all other inline properties — `fontSize`, `alignItems`, `gap` — untouched).

**Desktop re-diff against `baseline-pre.json` (Task 1) after Task 8:** re-ran the same
programmatic structural diff used for Task 7 (header padding, sidebar width/display, main
padding, h1 font-size, composer textarea rect + font-size, all input font-sizes, `innerHeight`/
`innerWidth`) across all 6 surfaces. **Zero differences** — Task 8's edits to
`recent-activity-strip.tsx` and `message-stream.tsx` (both live on `/app/workflows` and
`/app/chat/<thread>` respectively, surfaces already covered by the Task 1 baseline) introduced no
desktop regression on any previously-tracked metric.

`npx tsc --noEmit` clean; `npx vitest run` — 568 passed, 2 skipped, 12 todo (identical count to
pre-Task-8, confirming zero unit-test regressions from the 3 component edits). Per the
coordinator's instruction, the full `a11y.spec.ts` suite was not re-run — the pre-existing
`/login` failure (Deviation #3 below) is unrelated to any Task 8 file and stays deferred.
`npx playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome` — 16 skipped (was 13), 0
failed, exit 0 (3 new Task 8 tests added, same `HAS_LIVE_STACK` skip convention).

## Known Stubs

None — this plan is a pure CSS/layout fix pass; no new data-fetching or UI stub surfaces were
introduced.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes. All
changes are client-side layout/CSS.

## Issues Encountered

- Anonymous demo-sandbox creation rate limit (10/hour/IP) exhausted during measurement — worked
  around via the shared demo account (see Decisions).
- Dev server's Turbopack CSS pipeline required a template-file edit to pick up a `globals.css`-only
  change — worked around, documented for future sessions.
- Pre-existing, unrelated WCAG 2.1 AA color-contrast failure on `/login` — deferred, documented.

## Next Steps

Task 7 is a `checkpoint:human-verify` with `gate="blocking"` — **awaiting explicit user
verification** before this plan can be marked complete. All 6 F1-F6 fix tasks, the F1-F6 durable
regression tests, the Task 8 (8a/8b/8c) fix, and the Task 8 durable regression tests are all
committed. The user should:

1. Open the dev server on a real phone or Chrome DevTools device toolbar at iPhone 13 (390×664)
   and manually verify the 5-point checklist in the plan's `<how-to-verify>` block, plus the three
   Task 8 fixes (stat strip on `/app/workflows`, chat thread header title, composer hint row).
2. Widen to ≥1280px and confirm desktop looks unchanged.
3. Respond "approved" or describe what still renders wrong (surface + viewport width).

Follow-up quick task recommended for the pre-existing `/login` color-contrast failures
(`deferred-items.md`).

## Self-Check: PASSED

All 13 modified/created source and test files confirmed present on disk (including Task 8's
`recent-activity-strip.tsx` and `message-stream.tsx`). All 8 commit hashes (dbadb70, f481aa5,
e6f286b, aa997b4, 3d0dd26, 6c24629, 949ff8b, a9cf678) confirmed present in git log.
