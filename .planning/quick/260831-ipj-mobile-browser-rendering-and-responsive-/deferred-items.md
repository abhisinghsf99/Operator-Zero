# Deferred items — 260831-ipj

Out-of-scope discoveries found during Task 7 verification, NOT fixed (scope boundary: only
auto-fix issues directly caused by this plan's own file changes).

## Pre-existing WCAG 2.1 AA color-contrast failures on /login

`npx playwright test tests/e2e/a11y.spec.ts` fails 2/42 tests (both are the same test, run once
per project — `chromium` and `mobile-chrome`):

`UX-02 — WCAG 2.1 AA automated scan (axe-core) › login page passes WCAG 2.1 AA scan (no auth required)`

axe-core reports `color-contrast` violations (serious impact) on `/login`:
- `<span style="font-size:11px;color:var(--text-faint);font-family:var(--font-mono)">or</span>`
  — contrast 2.64:1 against `--bg-elevated` (needs 4.5:1)
- `<p style="...font-size:13px;color:var(--text-tertiary)">Don't have an account? <a href="/signup">Sign up</a></p>`
  — contrast 4.22:1 against `--bg-elevated` (needs 4.5:1)

**Confirmed pre-existing and unrelated to this plan:** `git diff 8ad54c1 HEAD --stat` shows this
plan touched 10 files (thread-sidebar, chat pages, primitives.tsx, composer.tsx, globals.css,
app/layout.tsx, app/app/layout.tsx, the two workflows-view files) — `app/(auth)/login/page.tsx`
and the `--text-faint`/`--text-tertiary`/`--bg-elevated` design tokens were never touched. This
plan only appended new CSS rules (F4 media query, `.h-screen-dvh`) at the end of `globals.css`;
it did not modify `:root` token values. The failure reproduces identically on both `chromium`
(1280px, unaffected by any `max-width:768px` rule in this plan) and `mobile-chrome`.

Fixing this requires a design-token or copy change on the login page (darkening
`--text-faint`/`--text-tertiary` or increasing font-weight) — out of scope for a mobile-rendering
fix. Flagging for a follow-up quick task.
