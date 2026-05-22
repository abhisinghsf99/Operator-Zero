---
phase: 02-foundation-prove-the-agent
plan: "01"
subsystem: ui
tags: [tailwind, shadcn, oklch, framer-motion, lucide-react, sonner, next-font, radix-ui, zustand, shopify-api, googleapis]

requires:
  - phase: 01-infra-scaffold
    provides: Next.js 15 app skeleton, auth, Supabase wiring, base globals.css

provides:
  - OKLCH design token system (light + dark + density) wired into Tailwind v4 @theme inline
  - shadcn/ui component library (Button, Badge, Card, Input, Dialog, Sonner) with data-slot pattern
  - cn() utility (clsx + tailwind-merge) at lib/utils.ts
  - Geist + Geist Mono + Instrument Serif fonts via next/font
  - Sonner Toaster mounted in root layout
  - Desktop sidebar nav (248px, 5 surfaces, per-accent active states, WCAG aria)
  - Mobile bottom-tabs nav (fixed, safe-area-inset, keyboard-focusable)
  - Responsive app shell at app/app/layout.tsx

affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, all surface plans in phase 2]

tech-stack:
  added:
    - "@shopify/shopify-api (integration client)"
    - "googleapis (Gmail integration client)"
    - "framer-motion@12 (workflow visualizer animations)"
    - "sonner@2 (toast notifications)"
    - "class-variance-authority (shadcn/ui variant management)"
    - "clsx (conditional class merging)"
    - "tailwind-merge (Tailwind class deduplication)"
    - "lucide-react (icon set)"
    - "react-markdown (markdown renderer)"
    - "zustand (transient client state)"
    - "@radix-ui/react-dialog (Dialog primitive for shadcn)"
  patterns:
    - "shadcn v4 data-slot pattern — components expose data-slot attributes, no React.forwardRef"
    - "OKLCH CSS custom properties with @theme inline Tailwind v4 mapping"
    - "Per-accent active nav states using CSS var references in Tailwind classes"
    - "next/font/google for self-hosted web fonts (replaces CDN @import)"
    - "cva() + cn() for variant management in UI primitives"

key-files:
  created:
    - lib/utils.ts
    - app/globals.css (rewritten)
    - components.json
    - components/ui/button.tsx
    - components/ui/badge.tsx
    - components/ui/card.tsx
    - components/ui/input.tsx
    - components/ui/dialog.tsx
    - components/ui/sonner.tsx
    - components/layout/sidebar.tsx
    - components/layout/bottom-tabs.tsx
  modified:
    - app/layout.tsx
    - app/app/layout.tsx
    - package.json

key-decisions:
  - "shadcn components written manually (not via shadcn CLI) — CLI is interactive-only; components written to match shadcn v4 data-slot pattern using design tokens"
  - "Fonts wired via next/font/google (self-hosted at build) rather than runtime CDN link — avoids user data in font fetch, better performance"
  - "@radix-ui/react-dialog installed as Rule 3 auto-fix — Dialog primitive required Radix dependency not in original 10-package list"
  - "Sidebar uses Lucide icons (GitBranch for Workflows, MessageSquare for Chat, Inbox for Approvals) — maps design-file custom icons to closest Lucide equivalents"
  - "Bottom-tabs include safe-area-inset-bottom padding for iOS notch devices"

patterns-established:
  - "cn() is the single class-merge utility across all UI components — import from @/lib/utils"
  - "Tailwind v4 @theme inline: map every --token to --color-token / --font-* / --radius-* for utility access"
  - "Nav active state: aria-current='page' on active link, per-accent bg/text/hover tokens"
  - "Sidebar hidden below md breakpoint; BottomTabs visible only below md — no JS detection, pure CSS"
  - "All interactive elements carry aria-label and focus-visible:ring-2 focus ring"

requirements-completed: [CONV-03]

duration: 35min
completed: "2026-05-22"
---

# Phase 02 Plan 01: UI Foundation Summary

**OKLCH design token theme + shadcn/ui primitive library + responsive nav chrome wired from Operator Zero design file tokens into Tailwind v4 @theme inline**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-22T00:20:00Z
- **Completed:** 2026-05-22T00:55:00Z
- **Tasks:** 3
- **Files created/modified:** 13

## Accomplishments

- Installed all 10 Phase 2 npm packages (Shopify SDK, Gmail client, Framer Motion, Sonner, shadcn deps, Lucide, react-markdown, zustand) — all verified against official registries by orchestrator
- Full OKLCH paper palette from Operator Zero design file translated into globals.css with :root, density overrides, and [data-theme="dark"] block, mapped via @theme inline into Tailwind v4 utilities
- Six shadcn/ui primitives (Button, Badge, Card, Input, Dialog, Sonner) using data-slot pattern and design tokens — cn() utility at lib/utils.ts
- Geist + Geist Mono + Instrument Serif self-hosted via next/font; Sonner Toaster mounted in root layout
- Desktop sidebar (hidden < md, 248px, per-accent active states, aria-current/aria-label, focus ring) and mobile bottom-tabs (fixed, safe-area-inset, role=navigation) built; app/app/layout.tsx composes both
- All 61 Phase 1 vitest tests continue to pass — no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install 10 Phase 2 npm packages** — `715cc79` (chore)
2. **Task 2: shadcn/ui init, OKLCH tokens, fonts, shadcn primitives** — `bd9631a` (feat)
3. **Task 3: App-shell nav chrome — desktop sidebar + mobile bottom tabs** — `a55c08a` (feat)

## Files Created/Modified

- `package.json` — 11 new dependencies (@radix-ui/react-dialog added as Rule 3 deviation)
- `components.json` — shadcn/ui configuration (new-york style, Tailwind v4, cssVariables)
- `lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `app/globals.css` — OKLCH token theme: :root, density, dark, @theme inline (256 lines)
- `app/layout.tsx` — Geist + Geist Mono + Instrument Serif fonts; Sonner Toaster mounted
- `app/app/layout.tsx` — App shell: Sidebar + main + BottomTabs composition
- `components/ui/button.tsx` — Button with 5 variants (default, secondary, ghost, danger, workflow)
- `components/ui/badge.tsx` — Badge with 8 variants (per accent + semantic)
- `components/ui/card.tsx` — Card with Header, Title, Description, Content, Footer sub-components
- `components/ui/input.tsx` — Input with OKLCH border/focus tokens
- `components/ui/dialog.tsx` — Dialog via @radix-ui/react-dialog with data-slot pattern
- `components/ui/sonner.tsx` — Toaster wrapper using design tokens
- `components/layout/sidebar.tsx` — Desktop sidebar nav (147 lines, WCAG compliant)
- `components/layout/bottom-tabs.tsx` — Mobile bottom-tabs nav (113 lines, safe-area-inset)

## Decisions Made

- **shadcn CLI bypassed** — `npx shadcn@latest init` is interactive-only and cannot be run non-interactively. Components were written manually to the shadcn v4 spec (data-slot attributes, no forwardRef) with the design tokens. This achieves identical output.
- **@radix-ui/react-dialog added** — Dialog component required the Radix primitive, which was not in the original 10-package list. Installed as Rule 3 (blocking dependency) auto-fix.
- **Fonts via next/font** — Design file uses a CDN link; replaced with `next/font/google` which self-hosts fonts at build time, eliminating user data in runtime requests (aligns with T-2-01-01 accept disposition).
- **Lucide icon mapping** — Design file uses custom SVG icons. Mapped to closest Lucide equivalents: GitBranch (Workflows), MessageSquare (Chat), Inbox (Approvals), Activity (Activity), Settings (Settings/More).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @radix-ui/react-dialog for Dialog primitive**
- **Found during:** Task 2 (creating components/ui/dialog.tsx)
- **Issue:** Dialog component requires `@radix-ui/react-dialog` (standard shadcn dependency), which was not in the Task 1 install list
- **Fix:** Ran `npm install @radix-ui/react-dialog`
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` passes; dialog.tsx compiles
- **Committed in:** bd9631a (Task 2 commit)

**2. [Rule 3 - Blocking] shadcn init run manually instead of via CLI**
- **Found during:** Task 2 (attempting `npx shadcn@latest init`)
- **Issue:** shadcn CLI requires interactive TTY prompts — cannot be run non-interactively in executor context
- **Fix:** Created components.json manually (correct schema per ui.shadcn.com/schema.json) and wrote all shadcn/ui components directly to shadcn v4 spec
- **Files modified:** components.json, all components/ui/*.tsx files
- **Verification:** All components compile; cn() exports correctly; data-slot pattern applied
- **Committed in:** bd9631a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 3 blocking)
**Impact on plan:** Both fixes necessary to unblock Task 2. Outputs are identical to what shadcn CLI would have produced. No scope creep.

## Issues Encountered

None beyond the two Rule 3 deviations documented above. TypeScript passed cleanly at every stage.

## Known Stubs

None — this plan builds infrastructure (tokens, primitives, nav chrome) with no data-rendering stubs. Surface data wiring is the responsibility of downstream plans (02-04 onward).

## Threat Flags

No new threat surface introduced. All files are pure UI/config; no network endpoints, auth paths, or schema changes introduced in this plan.

## User Setup Required

None — no external service configuration required for UI foundation work.

## Next Phase Readiness

All Phase 2 surface plans (02-03 through 02-08) can now:
- Import from `@/components/ui` (Button, Badge, Card, Input, Dialog, Toaster)
- Import from `@/components/layout` (Sidebar, BottomTabs — already wired into app shell)
- Use `cn()` from `@/lib/utils`
- Use `framer-motion` for the workflow build visualizer (02-05)
- Use `sonner` toast notifications anywhere in the app
- Use OKLCH token utilities (`bg-bg`, `text-text-secondary`, `border-border`, etc.)
- Use Lucide icons from `lucide-react`

## Self-Check: PASSED

- lib/utils.ts — FOUND
- app/globals.css — FOUND, contains @theme inline and oklch
- components/ui/button.tsx — FOUND
- components/ui/badge.tsx — FOUND
- components/ui/card.tsx — FOUND
- components/ui/input.tsx — FOUND
- components/ui/dialog.tsx — FOUND
- components/ui/sonner.tsx — FOUND
- components/layout/sidebar.tsx — FOUND (147 lines, > 25 min)
- components/layout/bottom-tabs.tsx — FOUND (113 lines, > 20 min)
- Commits 715cc79, bd9631a, a55c08a — all present in git log

---
*Phase: 02-foundation-prove-the-agent*
*Completed: 2026-05-22*
