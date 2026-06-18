# Quick Task 260618-nja — Summary

**Task:** Land new users on the Workflows tab after onboarding.
**Requirement:** D-16 (default landing surface = `/app/workflows`).
**Status:** Complete. 1 atomic commit (`a49f8dc`).

## What changed

Both remaining onboarding redirects that sent users to `/app/chat` now point to
`/app/workflows`, the canonical default landing surface. This closes the last two
gaps — login and demo/sandbox flows already land on `/app/workflows`.

| File | Change |
|------|--------|
| `app/onboarding/actions.ts` | `completeOnboarding()` redirect changed from `redirect("/app/chat?welcome=1")` to `redirect("/app/workflows")`. The chat-specific `?welcome=1` seed is intentionally dropped. Updated the two `completeOnboarding()` doc-summary lines, the function JSDoc, and the inline redirect comment. |
| `app/onboarding/page.tsx` | Completed-onboarding guard redirect changed from `redirect("/app/chat")` to `redirect("/app/workflows")`. Updated the header doc comment and inline guard comment. |
| `app/onboarding/_steps/done.tsx` | Doc-comment only — updated to describe the `/app/workflows` redirect (was the residual `/app/chat` reference the verify gate flagged). |
| `tests/unit/onboarding-progress.test.ts` | ONBOARD-08 test title and assertion updated from `/app/chat` to `/app/workflows`; file-header requirement note updated. |

## Deviation from plan

The plan listed three files, but the verify gate (`grep -rn 'app/chat' app/onboarding/`)
also flagged a doc comment in `app/onboarding/_steps/done.tsx`. Updated that comment
too (doc-only, no behavior change) so the gate passes and the docs stay accurate.

## Verification

- `grep -rn 'app/chat' app/onboarding/` → `OK: no /app/chat in app/onboarding`
- `npx vitest run tests/unit/onboarding-progress.test.ts` → 15 passed (1 file)

## Success criteria — met

- New users completing onboarding land on `/app/workflows`.
- Users revisiting `/onboarding` after completion are redirected to `/app/workflows`.
- The onboarding unit suite passes with the updated redirect target.
