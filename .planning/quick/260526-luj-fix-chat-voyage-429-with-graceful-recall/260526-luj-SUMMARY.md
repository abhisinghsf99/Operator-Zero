---
quick_id: 260526-luj
type: summary
phase: quick
plan: 260526-luj
subsystem: agent-runtime, settings
tags: [graceful-degradation, voyage, embedding, byok, settings, chat]
completed_date: 2026-05-26
duration: ~8 minutes
tasks_completed: 2
files_modified: 5
commits:
  - hash: 05fb34f
    message: "fix(260526-luj): make Voyage semantic recall non-fatal so chat always streams"
  - hash: 9f5cbf3
    message: "feat(260526-luj): add presentational BYOK showcase card to Settings"
key_files:
  modified:
    - lib/agent/prompt.ts
    - app/api/chat/[threadId]/send/route.ts
    - components/chat/message-stream.tsx
    - app/app/settings/page.tsx
  created:
    - app/app/settings/_byok.tsx
---

# Quick Task 260526-luj: Fix Chat Voyage 429 With Graceful Recall

**One-liner:** Wrapped Voyage embedding recall in try/catch so a free-tier 429 degrades to empty semantic recall without breaking chat streaming; added a read-only BYOK showcase card to Settings.

## Part A: Chat Graceful Degradation

### What was done

**`lib/agent/prompt.ts`** — Added `safeRecallMemory()` helper that wraps `recallMemory(userId, query, topK)` in try/catch. On any error it logs `{ level: "warn", event: "prompt.semantic_recall_unavailable", error, timestamp }` to console.error and resolves to `[]`. The `Promise.all` in `buildSystemPrompt` now uses `safeRecallMemory` for the embedding-dependent path. The three plain-DB loaders (`loadMemoryItems`, `loadBrandVoiceProfile`, `loadStoreContext`) remain unguarded — their failures are real bugs, not rate-limit noise.

**`app/api/chat/[threadId]/send/route.ts`** — Added belt-and-suspenders wrapping for the pre-stream region (outside the ReadableStream try/catch). `checkCostCap` is wrapped — on throw, logs `chat.cost_cap_check_failed` and defaults `capStatus = "ok"` (non-hard, keeping write tools enabled). `buildSystemPrompt` is wrapped — on throw, logs `chat.system_prompt_failed` and falls back to a hardcoded minimal role prompt so the stream always starts. Model id, rate limiter, RLS, tool loop, and `recall_memory` tool are untouched.

**`components/chat/message-stream.tsx`** — At the `!resp.ok` site, branches error message on HTTP status: 429 → rate-limit copy, 401/403 → session-refresh copy, else → existing error text. At the SSE `event.error` site, fallback copy changed to "The reply stream was interrupted. Try sending again." The `parseErr` catch guard was updated from `!== "Stream error"` to `instanceof SyntaxError` to correctly re-throw intentional stream errors after the message text change.

### Verification

- `npx tsc --noEmit` — clean (0 errors)
- `npx vitest run` — 351 passed | 3 skipped | 12 todo

## Part B: BYOK Showcase Card

### What was done

**`app/app/settings/_byok.tsx`** (new file) — `"use client"` presentational component exporting `ByokSection({ isDemo?: boolean })`. Fully disabled: no state mutation, no server action, no DB reads. Structure:
- `<section aria-labelledby={headingId}>` with a `useId()`-tied heading "Bring your own model" + `<Badge accent="experiment">Demo</Badge>`
- `<Card padding={18} style={{ opacity: 0.7 }}>` containing:
  - Provider chips row: active "Anthropic · Claude" chip (var(--text) foreground) + muted "OpenAI · GPT", "Google · Gemini", "Meta · Llama", "Mistral" chips (var(--text-tertiary))
  - Disabled API key input with `Icons.Lock` (aria-hidden) in a relative-positioned container; input has `aria-label="API key (disabled in demo)"`
  - Disabled `<Button variant="secondary" size="sm" disabled>Connect</Button>`
  - Footnote paragraph with optional `" This demo runs on a shared key."` when `isDemo === true`

**`app/app/settings/page.tsx`** — Added `import { ByokSection }` and `import { isDemoUser }` imports. Inserted `{ id: "ai-provider", label: "AI Provider", icon: "Lock" as const, description: "Bring your own model key", content: <ByokSection isDemo={isDemoUser(profile.user_id)} /> }` into the sections array immediately after the `connections` entry.

### Verification

- `npx tsc --noEmit` — clean (0 errors)
- `npx vitest run` — 351 passed | 3 skipped | 12 todo
- `grep -q "ByokSection" page.tsx` — OK
- `grep -q '"use client"' _byok.tsx` — OK

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseErr catch guard broke after SSE error message change**
- **Found during:** Task 1 (Part A)
- **Issue:** The `catch (parseErr)` block in message-stream.tsx used `parseErr.message !== "Stream error"` to distinguish JSON parse errors (skip) from intentional stream-error throws (rethrow). Changing the `event.error` message text would have broken this guard — the new message would not equal "Stream error", causing the intentional rethrow to be swallowed as a JSON parse error.
- **Fix:** Changed the guard to `parseErr instanceof SyntaxError` — JSON.parse throws SyntaxError, while the intentional `new Error(...)` is a base Error. This correctly distinguishes the two cases regardless of message text.
- **Files modified:** components/chat/message-stream.tsx
- **Commit:** 05fb34f

## Known Stubs

None — the BYOK card is intentionally a non-functional showcase (v2 feature). Its read-only state is the design intent, not a data-wiring gap.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- lib/agent/prompt.ts — FOUND (contains safeRecallMemory + try/catch)
- app/api/chat/[threadId]/send/route.ts — FOUND (contains chat.cost_cap_check_failed + chat.system_prompt_failed guards)
- components/chat/message-stream.tsx — FOUND (contains rate-limit/session copy + SyntaxError guard)
- app/app/settings/_byok.tsx — FOUND
- app/app/settings/page.tsx — FOUND (contains ai-provider section)
- Commit 05fb34f — FOUND
- Commit 9f5cbf3 — FOUND
