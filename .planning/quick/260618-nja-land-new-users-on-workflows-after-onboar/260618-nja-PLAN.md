---
phase: quick-260618-nja
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/onboarding/actions.ts
  - app/onboarding/page.tsx
  - tests/unit/onboarding-progress.test.ts
autonomous: true
requirements: [D-16]
must_haves:
  truths:
    - "A user who completes onboarding lands on /app/workflows, not /app/chat"
    - "A user who revisits /onboarding after completing it is redirected to /app/workflows"
    - "The onboarding unit test suite passes with the new redirect target"
  artifacts:
    - path: app/onboarding/actions.ts
      provides: "completeOnboarding() redirecting to /app/workflows"
      contains: "/app/workflows"
    - path: app/onboarding/page.tsx
      provides: "completed-onboarding guard redirecting to /app/workflows"
      contains: "/app/workflows"
    - path: tests/unit/onboarding-progress.test.ts
      provides: "ONBOARD-08 redirect assertion targeting /app/workflows"
      contains: "/app/workflows"
  key_links:
    - from: app/onboarding/actions.ts
      to: /app/workflows
      via: "redirect() call in completeOnboarding()"
      pattern: "redirect\\(\"/app/workflows\"\\)"
    - from: app/onboarding/page.tsx
      to: /app/workflows
      via: "redirect() call in completed-onboarding guard"
      pattern: "redirect\\(\"/app/workflows\"\\)"
---

<objective>
Land new users on the Workflows tab after onboarding. Two onboarding redirects still send users to `/app/chat` and must point to `/app/workflows` — the canonical default landing surface per D-16. Login and demo/sandbox flows already land on `/app/workflows`; this closes the last two gaps.

Purpose: Make `/app/workflows` the consistent post-onboarding landing surface, aligning onboarding with login and demo flows. The `?welcome=1` welcome seed is chat-specific and is intentionally dropped.
Output: Two source edits + matching test update, suite green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@app/onboarding/actions.ts
@app/onboarding/page.tsx
@tests/unit/onboarding-progress.test.ts

<interfaces>
<!-- Exact current state confirmed by reading the files. Edit in place; no exploration needed. -->

app/onboarding/actions.ts:
- Line ~9 (doc comment): `completeOnboarding()  — sets onboarding_completed_at; redirects to /app/chat`
- Line ~23 (duplicate doc comment block): `completeOnboarding()  — sets onboarding_completed_at; redirects to /app/chat`
- Lines ~99-103 (function JSDoc): "...then redirects to /app/chat with a welcome seed param." / "@returns { error } on auth failure; redirects to /app/chat on success"
- Line ~125 (inline comment): `// 3. Redirect to Conversation with a welcome seed (ONBOARD-08)`
- Line ~126 (the redirect): `redirect("/app/chat?welcome=1");`

app/onboarding/page.tsx:
- Line ~18 (doc comment): "Authenticated users with onboarding_completed_at set are redirected to /app"
- Line ~51 (inline comment): `// 2. If onboarding already completed, redirect to app`
- Line ~52 (the redirect): `redirect("/app/chat");`

tests/unit/onboarding-progress.test.ts:
- Line ~238 (test title): `it("redirects to /app/chat after completing onboarding (ONBOARD-08)", async () => {`
- Line ~247 (assertion): `expect(redirectCalls[0]?.[0]).toMatch(/\/app\/chat/);`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redirect onboarding completion and guard to /app/workflows</name>
  <files>app/onboarding/actions.ts, app/onboarding/page.tsx, tests/unit/onboarding-progress.test.ts</files>
  <action>
Implement the workflows landing surface per D-16 across all three files:

1. `app/onboarding/actions.ts`:
   - Change the redirect at line ~126 from `redirect("/app/chat?welcome=1");` to `redirect("/app/workflows");`. The `?welcome=1` seed is chat-specific and is intentionally dropped.
   - Update the doc comments that reference the old behavior so they describe redirecting to /app/workflows: the two `completeOnboarding()` summary lines (~9 and ~23) that say "redirects to /app/chat"; the function JSDoc (~99-103) that says "redirects to /app/chat with a welcome seed param" and "redirects to /app/chat on success"; and the inline comment at ~125 ("Redirect to Conversation with a welcome seed") — reword to reflect landing on the Workflows surface (drop the welcome-seed language).

2. `app/onboarding/page.tsx`:
   - Change the completed-onboarding guard at line ~52 from `redirect("/app/chat");` to `redirect("/app/workflows");`.
   - Update the doc comment at ~18 ("...are redirected to /app") to reflect /app/workflows; the inline comment at ~51 may stay or be refined ("redirect to workflows surface").

3. `tests/unit/onboarding-progress.test.ts`:
   - Update the ONBOARD-08 test (~238): change the title from "redirects to /app/chat after completing onboarding" to "redirects to /app/workflows after completing onboarding", and change the assertion (~247) from `toMatch(/\/app\/chat/)` to `toMatch(/\/app\/workflows/)`.
   - Scan the rest of this file for any other assertion of the onboarding-complete redirect target equal to /app/chat and update those too. Do NOT change unrelated tests that navigate to /app/chat for chat-feature testing (those are not asserting the onboarding-complete redirect).
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && grep -rn 'app/chat' app/onboarding/ && echo "FAIL: residual /app/chat refs in onboarding" || echo "OK: no /app/chat in app/onboarding"</automated>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx vitest run tests/unit/onboarding-progress.test.ts</automated>
  </verify>
  <done>
- `app/onboarding/actions.ts` redirects to `/app/workflows` (no `?welcome=1`), comments updated.
- `app/onboarding/page.tsx` completed guard redirects to `/app/workflows`, comment updated.
- No remaining `/app/chat` references in `app/onboarding/`.
- ONBOARD-08 test asserts `/app/workflows` and the onboarding-progress suite passes.
  </done>
</task>

</tasks>

<verification>
- `grep -rn 'app/chat' app/onboarding/` returns nothing.
- `npx vitest run tests/unit/onboarding-progress.test.ts` passes green.
</verification>

<success_criteria>
- New users completing onboarding land on `/app/workflows`.
- Users revisiting `/onboarding` after completion are redirected to `/app/workflows`.
- The onboarding unit suite passes with the updated redirect target.
</success_criteria>

<output>
Create `.planning/quick/260618-nja-land-new-users-on-workflows-after-onboar/260618-nja-SUMMARY.md` when done
</output>
