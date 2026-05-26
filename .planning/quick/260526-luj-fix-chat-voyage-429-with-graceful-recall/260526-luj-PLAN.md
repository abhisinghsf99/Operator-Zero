---
quick_id: 260526-luj
type: execute
autonomous: true
files_modified:
  - lib/agent/prompt.ts
  - app/api/chat/[threadId]/send/route.ts
  - components/chat/message-stream.tsx
  - app/app/settings/_byok.tsx
  - app/app/settings/page.tsx
must_haves:
  truths:
    - "A normal chat message gets a streamed assistant reply even when Voyage returns 429 (free-tier rate limit)"
    - "buildSystemPrompt never throws on a Voyage/embedding error — it degrades by omitting SEMANTIC RECALL"
    - "Structured memory items + brand-voice PROFILE (loaded via plain DB reads, no embedding) still appear in the prompt during a Voyage outage"
    - "Settings shows a new read-only 'AI Provider' / 'Bring your own model' card that is not editable and triggers no server action"
  artifacts:
    - path: lib/agent/prompt.ts
      provides: "buildSystemPrompt with try/catch-wrapped embedding recall (graceful degradation)"
    - path: app/api/chat/[threadId]/send/route.ts
      provides: "Pre-stream buildSystemPrompt + checkCostCap hardened against hard-500"
    - path: app/app/settings/_byok.tsx
      provides: "Presentational disabled BYOK showcase card (ByokSection)"
  key_links:
    - from: app/app/settings/page.tsx
      to: app/app/settings/_byok.tsx
      via: "sections array entry id='ai-provider' rendering <ByokSection isDemo={...} />"
      pattern: "ByokSection"
---

<objective>
Fix the chat 500 caused by a Voyage free-tier 429 (3 RPM) and add a presentational Bring-Your-Own-Key showcase card to Settings.

Purpose: Semantic recall is a nice-to-have enrichment, not a hard dependency of chat. A Voyage 429 currently propagates out of `buildSystemPrompt` (called OUTSIDE the stream try/catch in the send route), so the POST 500s and the user sees "Message failed to send" / "Stream failed". Chat must always stream a reply; semantic recall degrades to absent. Separately, surface a provider-agnostic BYOK card to communicate the "run on your own model" story (demo-only, non-functional).

Output: Two atomic commits — (A) chat graceful-degradation fix across prompt.ts + send route + client copy; (B) new `_byok.tsx` + its registration in the settings page.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Confirmed from the codebase — use directly, no exploration needed. -->

lib/agent/prompt.ts (current behavior to preserve while wrapping recall):
- `buildSystemPrompt(userId: string, query?: string, opts?: { budget?: "chat"|"workflow" }): Promise<string>`
- Internally runs `Promise.all([ loadMemoryItems, loadBrandVoiceProfile, loadStoreContext, query ? recallMemory(userId, query, 5) : Promise.resolve([]) ])` then `assemblePrompt(...)`.
- `recallMemory` (lib/agent/memory.ts) calls `embedText()` (Voyage) — this is the ONLY embedding-dependent input into the prompt. `loadMemoryItems` / `loadBrandVoiceProfile` / `loadStoreContext` are plain DB reads (no embedding).
- `assemblePrompt` already renders an empty-recall section as `## SEMANTIC RECALL\n(No relevant memories found.)` when `semanticRecall: []`. So degradation = pass `semanticRecall: []`.

app/api/chat/[threadId]/send/route.ts (the unguarded pre-stream region, ~L215-227):
- `const capStatus = await checkCostCap(userId);` then `const includeWriteTools = capStatus !== "hard";`
- `const systemPrompt = await buildSystemPrompt(userId, body.message, { budget: "chat" });`
- These run BEFORE the `new ReadableStream({ async start(controller) { try { ... } } })` — so they can hard-500.
- `capStatus` is compared via `!== "hard"`; non-"hard" is the safe default.

components/chat/message-stream.tsx (error paths):
- ~L180: `if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Stream failed" })); throw new Error(err.error ?? `HTTP ${resp.status}`); }`
- ~L207: inside SSE loop `if (event.error) { throw new Error(event.message ?? "Stream error"); }`
- `resp.status` is available at the !resp.ok site (use 429/401/403 to vary copy).

Settings section shape (app/app/settings/_settings-shell.tsx):
- `interface SettingsSection { id: string; label: string; icon: IconName; description: string; content: ReactNode }`
- IMPORTANT: `icon` is an `IconName` STRING (e.g. `"Lock" as const`), NOT a JSX node. The shell does `const Ic = Icons[s.icon]`. Do NOT pass `<Icons.Lock />`.

Design primitives (components/design/primitives.tsx):
- `Card({ padding?, style?, children })` — disabled-look precedent is `style={{ opacity: 0.7 }}`.
- `Button({ variant?, size?, accent?, disabled?, children, ... })`, variant ∈ "primary"|"secondary"|"ghost"|"danger"|"accent"; disabled supported.
- `Badge({ accent?, size?, soft?, children })`, accent is an `Accent` token (e.g. "experiment", "activity"); the LABEL text ("Demo") is the children.
- Existing disabled card precedent: `_connections.tsx` Meta card — `<Card padding={18} style={{ opacity: 0.7 }}>` + `<DesignButton variant="secondary" size="sm" disabled>Coming soon</DesignButton>` + `<Badge size="sm" accent="experiment">v2</Badge>`.

Icons (components/design/icons.tsx) — confirmed to EXIST: `Icons.Lock`, `Icons.Spark`, `Icons.Sparkles`. Use `Icons.Lock` for the key/lock input affordance.

lib/auth/demo.ts: `isDemoUser(userId: string | null | undefined): boolean` — server-only, import as `import { isDemoUser } from "@/lib/auth/demo"`.

Profile input styling reference (app/app/settings/_profile.tsx `inputStyle`): unset/block/100%/padding "10px 12px"/background var(--bg-subtle)/border "0.5px solid var(--border)"/borderRadius var(--r-sm)/fontSize 13.5/color var(--text)/box-sizing border-box.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1 (Part A): Make Voyage-dependent semantic recall non-fatal so chat always streams</name>
  <files>lib/agent/prompt.ts, app/api/chat/[threadId]/send/route.ts, components/chat/message-stream.tsx</files>
  <action>
Three edits, all behavior-preserving except the failure path. This is commit A.

1. lib/agent/prompt.ts — `buildSystemPrompt`: isolate the embedding-dependent recall so it can never throw. Replace the single inline `query ? recallMemory(...) : Promise.resolve([])` element in the `Promise.all` with a recall value resolved from a guarded helper: when `query` is provided, call `recallMemory(userId, query, 5)` inside try/catch; on ANY error, emit `console.error(JSON.stringify({ level: "warn", event: "prompt.semantic_recall_unavailable", error: String(e), timestamp: new Date().toISOString() }))` and resolve to `[]` (empty `SemanticRecallItem[]`). Keep `loadMemoryItems`, `loadBrandVoiceProfile`, `loadStoreContext` running in parallel and UNGUARDED (they are plain DB reads — their failures are real bugs, not the 429). `assemblePrompt` already renders the empty-recall section, so structured memory + brand-voice PROFILE still appear. `buildSystemPrompt` MUST NEVER throw on a Voyage/embedding error. Do not change the function signature, the token budgets, or the `assemblePrompt` contract.

2. app/api/chat/[threadId]/send/route.ts — belt-and-suspenders for the pre-stream region (~L215-227, OUTSIDE the ReadableStream try/catch). Wrap `await checkCostCap(userId)` in try/catch; on throw, log `{ level:"warn", event:"chat.cost_cap_check_failed", error:String(e) }` and default `capStatus` to a non-"hard" value (so `includeWriteTools` stays true and the message still flows). Wrap `await buildSystemPrompt(userId, body.message, { budget:"chat" })` in try/catch; on throw (defensive — step 1 already prevents the Voyage path), log `{ level:"error", event:"chat.system_prompt_failed", error:String(e) }` and fall back to a minimal STATIC system prompt string (a short hardcoded "You are Operator Zero..." role-only prompt — no DB, no embedding) so the stream still starts. A normal message must ALWAYS reach the `new ReadableStream(...)` and stream a reply. Do NOT change the model id ("claude-opus-4-7"), the rate limiter, RLS/`withUserRls`, the agent tool loop, or remove the recall_memory tool.

3. components/chat/message-stream.tsx — copy-only improvement, no behavior change. At the `!resp.ok` site (~L180), branch the thrown message on `resp.status`: 429 → "The model is rate-limited right now. Wait a moment and try again."; 401/403 → "Your session needs a refresh — reload and sign in again."; else keep the existing `err.error ?? \`HTTP ${resp.status}\``. At the SSE `event.error` site (~L207), keep `event.message ?? "Stream error"` but make the generic fallback read "The reply stream was interrupted. Try sending again." Do not change control flow, state, abort handling, or the streaming loop.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run 2>&1 | tail -20</automated>
  </verify>
  <done>tsc strict passes with no new errors; full vitest suite green (351). `buildSystemPrompt` contains a try/catch around the `recallMemory` call that logs `prompt.semantic_recall_unavailable` and resolves to `[]`. The send route's pre-stream `buildSystemPrompt` and `checkCostCap` calls are each wrapped so neither can hard-500 a normal message. Client error copy distinguishes rate-limit/auth from generic.</done>
</task>

<task type="auto">
  <name>Task 2 (Part B): Add presentational BYOK showcase card to Settings</name>
  <files>app/app/settings/_byok.tsx, app/app/settings/page.tsx</files>
  <action>
Two changes. This is commit B (separate from Task 1's commit).

1. NEW app/app/settings/_byok.tsx — `"use client"`, fully presentational and DISABLED. No state mutation, no server action, no DB read, not editable. Export `function ByokSection({ isDemo }: { isDemo?: boolean })`. Mirror the disabled Meta card pattern from `_connections.tsx` (Card with `style={{ opacity: 0.7 }}`, a disabled `Button`). Structure:
   - A `<section aria-labelledby={...}>` with a SectionTitle-style heading "Bring your own model" (reuse the heading markup style from `_connections.tsx`: `<h2 className="display">` 28px + a tertiary description paragraph). Render a `<Badge size="sm" accent="experiment">Demo</Badge>` next to the title.
   - Inside a `<Card padding={18} style={{ opacity: 0.7 }}>`:
     - Provider chips row (plain text chips, NO brand SVGs): an active/filled chip "Anthropic · Claude" styled with `--text` foreground (e.g. background var(--bg-subtle), color var(--text), border 0.5px solid var(--border)); then muted chips "OpenAI · GPT", "Google · Gemini", "Meta · Llama", "Mistral" with color var(--text-tertiary). All non-interactive (plain spans, `aria-disabled` not needed since they are not buttons).
     - A disabled API key input: reuse the `inputStyle` shape from `_profile.tsx` (do not import it — inline an equivalent object), `disabled`, `readOnly`, `placeholder="sk-…"`, with an `Icons.Lock` rendered before/inside it (`aria-hidden`). Wrap input + icon in a relative-positioned container or a flex row so the lock sits with the field.
     - A disabled `<Button variant="secondary" size="sm" disabled>Connect</Button>`.
     - A footnote `<p>` at `color: var(--text-tertiary)`, `fontSize: 12`: "Run Operator Zero on the model you prefer — connect your own provider key, your usage is billed to you." Append " This demo runs on a shared key." ONLY when `isDemo === true`.
   - Accessibility: section has an `aria-labelledby` tied to the heading id (`useId()`); the disabled input has an `aria-label="API key (disabled in demo)"`; the lock icon is `aria-hidden`. Use design tokens only — no hardcoded hex.

2. MODIFY app/app/settings/page.tsx:
   - Add import: `import { ByokSection } from "@/app/app/settings/_byok";` and `import { isDemoUser } from "@/lib/auth/demo";`
   - Insert a new section object into the `sections` array IMMEDIATELY AFTER the `connections` entry (before `brand-voice`):
     `{ id: "ai-provider", label: "AI Provider", icon: "Lock" as const, description: "Bring your own model key", content: <ByokSection isDemo={isDemoUser(profile.user_id)} /> }`
   - NOTE: `icon` must be the string `"Lock" as const` (an `IconName`), NOT a JSX element — the SettingsShell does `Icons[s.icon]`. `profile.user_id` is already available in this server component.
   - Do NOT touch middleware, RLS, seed, env, or auth.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && grep -q "ByokSection" app/app/settings/page.tsx && grep -q '"use client"' app/app/settings/_byok.tsx && echo OK</automated>
  </verify>
  <done>`_byok.tsx` exists as a `"use client"` presentational component exporting `ByokSection({ isDemo })` with disabled provider chips, a disabled `sk-…` key input with an existing `Icons.Lock`, a disabled Connect button, and a footnote that adds the shared-key sentence only when `isDemo`. The settings page registers an `id:"ai-provider"` section with `icon:"Lock" as const` directly after `connections`, passing `isDemo={isDemoUser(profile.user_id)}`. tsc strict clean; no server action / DB / state in the card.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (strict, no `any` leaks).
- `npx vitest run` green (351 tests).
- Manual smoke (not gating): with Voyage at free-tier 429, sending "hello" in chat still returns a streamed reply (no 500); the SEMANTIC RECALL section is absent while MEMORY + BRAND VOICE remain.
- Settings → AI Provider shows the disabled BYOK card; nothing is clickable/editable.
</verification>

<success_criteria>
- A normal chat message ALWAYS streams a reply even when `recallMemory`/`embedText` throws a Voyage 429.
- `buildSystemPrompt` never throws on an embedding error; structured memory + brand-voice profile survive the degradation.
- Pre-stream `checkCostCap` and `buildSystemPrompt` in the send route cannot hard-500 a normal message.
- New read-only, provider-agnostic BYOK card present in Settings, demo-aware footnote, no functional wiring.
- Part A and Part B land as two separate atomic commits.
- Model id, rate limiter, RLS, tool loop, recall_memory tool unchanged. Middleware/RLS/seed/env/auth untouched.
</success_criteria>

<output>
Create `.planning/quick/260526-luj-fix-chat-voyage-429-with-graceful-recall/260526-luj-SUMMARY.md` when done.
</output>
