---
phase: quick-260527-ebw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - .env.local.example
  - lib/agent/llm/models.ts
  - lib/agent/llm/tools.ts
  - lib/agent/llm/pricing.ts
  - app/api/chat/[threadId]/send/route.ts
  - lib/integrations/gmail/classify.ts
  - lib/inngest/functions/catalog-audit.ts
  - app/app/settings/actions.ts
  - lib/agent/runtime.ts
  - tests/integration/chat-stream.test.ts
  - tests/unit/gmail-sync.test.ts
  - tests/unit/catalog-audit.test.ts
  - tests/unit/settings.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "MODEL_PROFILE=anthropic (default) produces byte-for-byte identical chat behavior and SSE event shapes — zero frontend change"
    - "Flipping MODEL_PROFILE to mixed/groq (or OZ_MODEL_<ROLE> overrides) routes the chat orchestrator to a different provider with a config change only — no code edit"
    - "The chat agentic tool loop fires tools through dispatchTool and renders the workflow_plan inline block under both anthropic and groq profiles"
    - "The 3 messages.create sites (classifier / catalog audit / brand-voice draft) route through resolveModel(<ROLE>) and keep their existing parse/coercion behavior"
    - "Per-request tool context (userId/threadId/automationLevel) is captured in a closure, never a module singleton (no wrong-user leakage)"
    - "Embeddings remain on Voyage; lib/agent/embeddings.ts and lib/agent/memory.ts are untouched"
  artifacts:
    - path: "lib/agent/llm/models.ts"
      provides: "AgentRole type, resolveModel(role), resolveModelChoice(role), PROFILES table, env resolution OZ_MODEL_<ROLE> -> MODEL_PROFILE -> default anthropic"
      contains: "resolveModel"
    - path: "lib/agent/llm/tools.ts"
      provides: "getAiSdkTools(includeWriteTools, ctx) wrapping registry tools as AI SDK tool() with execute delegating to dispatchTool"
      contains: "getAiSdkTools"
    - path: "lib/agent/llm/pricing.ts"
      provides: "costFor(modelId, inTok, outTok) per-model USD/MTok table with Opus DEFAULT fallback"
      contains: "costFor"
  key_links:
    - from: "app/api/chat/[threadId]/send/route.ts"
      to: "lib/agent/llm/models.ts"
      via: "resolveModel('ORCHESTRATOR') + resolveModelChoice('ORCHESTRATOR')"
      pattern: "resolveModel"
    - from: "app/api/chat/[threadId]/send/route.ts"
      to: "lib/agent/llm/tools.ts"
      via: "getAiSdkTools(includeWriteTools, agentCtx) built per-request"
      pattern: "getAiSdkTools"
    - from: "lib/integrations/gmail/classify.ts"
      to: "lib/agent/llm/models.ts"
      via: "generateText({ model: resolveModel('CLASSIFIER') })"
      pattern: "resolveModel"
---

<objective>
Add a provider abstraction + per-task model routing layer (Anthropic <-> Groq) over the Vercel AI SDK, switchable by a `MODEL_PROFILE` env var (config-driven only, no per-user DB / BYOK storage). Migrate the one streaming+tool chat site and the three `messages.create` sites off the raw Anthropic SDK onto `streamText`/`generateText`, delete dead `streamChat()`, and move the four Anthropic-SDK-boundary test mocks onto the new path.

Purpose: Let Sarah run the orchestrator/classifier/audit/drafter roles on different models ("best results") and flip the whole app to Groq with a one-line config change — without touching the chat frontend. Default profile `anthropic` = zero behavior change until flipped.

Output: `lib/agent/llm/{models,tools,pricing}.ts`; migrated chat route + 3 create sites; deleted dead code; `ai`+`@ai-sdk/anthropic`+`@ai-sdk/groq` installed; `.env.local.example` with `GROQ_API_KEY`/`MODEL_PROFILE`/commented `OZ_MODEL_<ROLE>`; four test mocks moved; full suite green + build clean.

This plan TRANSCRIBES the approved design at `/Users/abhisingh/.claude/plans/silly-mixing-boot.md`. Honor every decision there; do not redesign.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@/Users/abhisingh/.claude/plans/silly-mixing-boot.md

# The one streaming + tool-calling site being migrated (preserve auth/RLS/rate-limit/persist/error + SSE shapes byte-for-byte)
@app/api/chat/[threadId]/send/route.ts

# Tool registry — reused via dispatchTool; getAnthropicToolDefinitions + zodToJsonSchemaShape retired
@lib/agent/tools/index.ts

# Dead streamChat() to delete; classifyAgentError kept (Anthropic.APIError branch tested)
@lib/agent/runtime.ts

# Anthropic singleton — KEEP (protects sdk-smoke + agent-errors tests; Anthropic.APIError for classifyAgentError)
@lib/agent/anthropic.ts

# The 3 messages.create sites
@lib/integrations/gmail/classify.ts
@lib/inngest/functions/catalog-audit.ts

<interfaces>
<!-- Contracts the executor needs — extracted from the codebase. Use directly; no exploration needed. -->

From lib/agent/tools/index.ts (REUSED):
```typescript
export interface AgentContext {
  userId: string;
  automationLevel: "L1" | "L2" | "L3";
  threadId?: string;
  workflowRunId?: string;
}
export interface ToolResult { type: "tool_result"; content: string; is_error?: boolean; }
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;   // <-- real Zod schema; feed directly to AI SDK tool({ inputSchema })
  execute(input: unknown, ctx: AgentContext): Promise<ToolResult>;
  approvalRequired?: (input: unknown, ctx: AgentContext) => boolean;
}
export function getToolDefinitions(): Record<string, ToolDefinition | undefined>;
export async function dispatchTool(name: string, input: unknown, ctx: AgentContext): Promise<ToolResult>;
export const READ_TOOL_NAMES: string[];
export const WRITE_TOOL_NAMES: string[];
export const META_TOOL_NAMES: string[];
// readTools / writeTools / metaTools are arrays imported into index.ts from ./read, ./write, ./meta.
// getAiSdkTools should import getToolDefinitions() and partition by READ/WRITE/META_TOOL_NAMES,
// OR re-export the arrays — confirm whichever is cleanest against the actual ./read|./write|./meta exports.
```

Current chat-route SSE event shapes that MUST be preserved byte-for-byte (consumed by components/chat/message-stream.tsx — DO NOT TOUCH that file):
```
data: {"text":"<delta>"}\n\n
data: {"inline_block_type":"workflow_plan","inline_block_payload":<payload>}\n\n
data: [DONE]\n\n
data: {"error":"stream_error","message":"<string>"}\n\n
```

ToolResult.content is a JSON STRING. Inline-block extraction parses it:
```typescript
const parsed = JSON.parse(toolResult.content);
if (parsed.inline_block_type === "workflow_plan") { /* emit SSE inline-block event */ }
```
The AI SDK tool execute() must return the SAME shape dispatchTool returns (do NOT let the SDK double-wrap). Verify the executor reads .content off the tool-result part exactly as today.

From lib/agent/runtime.ts (classifyAgentError — KEEP unchanged; Anthropic.APIError branch is tested in agent-errors.test.ts):
```typescript
export interface AgentErrorClassification { type: "auth_error" | "transient" | "budget_exhausted"; }
export function classifyAgentError(err: unknown): AgentErrorClassification;
```
DELETE from runtime.ts: streamChat(), ChatContext, ChatResult, COST_WARNING, and the getAnthropicToolDefinitions import (grep first to confirm each is orphaned before removing).
</interfaces>

<critical_constraints>
- DO NOT touch: lib/agent/embeddings.ts, lib/agent/memory.ts (Voyage), components/chat/message-stream.tsx, lib/agent/anthropic.ts.
- KEEP @anthropic-ai/sdk@0.97.1 installed (classifyAgentError uses Anthropic.APIError; sdk-smoke.test.ts + agent-errors.test.ts must stay green). Do NOT add the `openai` package.
- New keys are server-only — NO NEXT_PUBLIC_ prefix anywhere.
- Vercel AI SDK is v5. Verify these v5 specifics against the ACTUALLY-INSTALLED package versions before coding (they changed from v4):
  - tool({ inputSchema, execute })   (NOT `parameters`)
  - agentic multi-step loop: stopWhen: stepCountIs(5)   (NOT `maxSteps`)
  - tool-call streaming is always-on
  - usage fields: inputTokens / outputTokens
  - confirm exact fullStream part type/field names (text-delta / tool-call / tool-result / finish) against the installed version — do not code from memory.
- Build getAiSdkTools PER-REQUEST with ctx captured in a closure — NEVER a module-level singleton (wrong-user security regression).
- Default profile = anthropic => zero behavior change until flipped.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install AI SDK deps, add env config, build the routing/tools/pricing modules</name>
  <files>package.json, .env.local.example, lib/agent/llm/models.ts, lib/agent/llm/tools.ts, lib/agent/llm/pricing.ts</files>
  <action>
Install the Vercel AI SDK v5 stack and create the three new server-only routing modules. NO migration of call sites yet — this task only adds new code so the suite stays green at commit.

1. Install deps with the package manager already in use (detect from lockfile): `ai`, `@ai-sdk/anthropic`, `@ai-sdk/groq` at matching majors (v5). KEEP `@anthropic-ai/sdk@0.97.1`. Do NOT add `openai`. After install, run the v5 API verification step below before writing module code.

2. v5 API verification (MANDATORY, do before coding): read the installed package's exported types for `tool`, `streamText`, `generateText`, `stepCountIs`, and the `fullStream` part union. Confirm: `tool({ inputSchema, execute })`; `stopWhen: stepCountIs(n)`; usage fields `inputTokens`/`outputTokens`; exact fullStream part `type` values and their text/tool-call/tool-result/finish field names; and `createAnthropic({ apiKey })` / `createGroq({ apiKey })` factory signatures. Code against what is installed, not from memory.

3. Create `lib/agent/llm/models.ts` (server-only, no NEXT_PUBLIC_). Export:
   - `type AgentRole = "ORCHESTRATOR" | "CLASSIFIER" | "AUDIT" | "DRAFTER"`
   - `resolveModel(role): LanguageModel` — returns an AI SDK model instance via `createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId)` or `createGroq({ apiKey: process.env.GROQ_API_KEY })(modelId)`.
   - `resolveModelChoice(role): { provider: "anthropic" | "groq"; modelId: string; maxTokens: number }` — the metadata used for cost + the persisted `model_id` column. resolveModel composes this internally.
   - Internal `PROFILES` table for `anthropic` / `groq` / `mixed`. Resolution order per role: per-role env override `OZ_MODEL_<ROLE>` (format `provider:modelId`, e.g. `groq:openai/gpt-oss-120b`) -> `MODEL_PROFILE` env -> default `anthropic`.
   - Profile model map (per the approved plan):
     - anthropic: ORCHESTRATOR `claude-opus-4-7`; CLASSIFIER + AUDIT `claude-haiku-4-5`; DRAFTER `claude-opus-4-5`
     - groq: ORCHESTRATOR + AUDIT + DRAFTER `openai/gpt-oss-120b`; CLASSIFIER `openai/gpt-oss-20b`
     - mixed: Opus orchestrator + Groq classifier/audit (the safe "best results" default) — DRAFTER follows anthropic in mixed unless the approved plan dictates otherwise; mirror the plan's intent (Opus orchestrator, Groq classifier/audit).
   - maxTokens per role: preserve today's values (ORCHESTRATOR 4096, CLASSIFIER 10, AUDIT 1024, DRAFTER 1024).

4. Create `lib/agent/llm/tools.ts`. Export `getAiSdkTools(includeWriteTools: boolean, ctx: AgentContext)`: iterate the existing registry (getToolDefinitions() partitioned by READ/WRITE/META_TOOL_NAMES — read tools + meta always; write tools only if includeWriteTools) and wrap each as `tool({ description: toolDef.description, inputSchema: toolDef.inputSchema, execute: (args) => dispatchTool(toolDef.name, args, ctx) })`. ctx is captured in the closure here — this MUST be called per-request, never memoized at module scope. This retires the lossy zodToJsonSchemaShape (which advertised every param as `string`). Return a `Record<string, Tool>` keyed by tool name (the shape AI SDK `tools:` expects). The execute return value is the existing ToolResult ({ type, content, is_error? }) — confirm the SDK surfaces it on the tool-result part without double-wrapping so the route's JSON.parse(content) still works.

5. Create `lib/agent/llm/pricing.ts`. Export `costFor(modelId: string, inTok: number, outTok: number): number` — per-model USD/MTok table; `DEFAULT` falls back to Opus rates `{ input: 3, output: 15 }` so an unknown id never under-bills. Add entries for the Anthropic + Groq model ids in the PROFILES map; Groq/Haiku rates are placeholders OK to start (note in a comment to confirm against live pricing). Formula matches today's: `(inTok * inputRate + outTok * outputRate) / 1_000_000`.

6. Edit `.env.local.example` (all server-only, no NEXT_PUBLIC_): add `GROQ_API_KEY=<key>`, `MODEL_PROFILE=anthropic` (default), and a commented block of `# OZ_MODEL_ORCHESTRATOR=provider:modelId` overrides for each role. Keep existing ANTHROPIC_API_KEY + VOYAGE_API_KEY lines.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && node -e "const m=require('fs').readFileSync('.env.local.example','utf8'); if(!/GROQ_API_KEY/.test(m)||!/MODEL_PROFILE=anthropic/.test(m)||!/OZ_MODEL_/.test(m)) {console.error('env example missing keys'); process.exit(1)} else console.log('env ok')" && grep -v '^#' lib/agent/llm/models.ts | grep -c "resolveModel" && grep -v '^#' lib/agent/llm/tools.ts | grep -c "getAiSdkTools" && grep -v '^#' lib/agent/llm/pricing.ts | grep -c "costFor"</automated>
  </verify>
  <done>`ai` + `@ai-sdk/anthropic` + `@ai-sdk/groq` installed (v5), `@anthropic-ai/sdk@0.97.1` still present, no `openai` dep. Three new modules compile under strict TS and export resolveModel/resolveModelChoice/AgentRole, getAiSdkTools, costFor respectively. `.env.local.example` has GROQ_API_KEY, MODEL_PROFILE=anthropic, and commented OZ_MODEL_<ROLE> overrides. No call sites changed yet; existing suite still passes.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate the chat route to streamText + update its test mock (paired so no commit lands red)</name>
  <files>app/api/chat/[threadId]/send/route.ts, tests/integration/chat-stream.test.ts</files>
  <action>
Migrate the single streaming+tool site onto the AI SDK and move its boundary mock in the SAME task so the suite never lands red on a commit.

Route (app/api/chat/[threadId]/send/route.ts):
- Replace the imports: drop `getAnthropicToolDefinitions`, `import { anthropic }`, `import type Anthropic`, and the `AnthropicMessage` type alias. Add `streamText, stepCountIs` from `ai`, `resolveModel, resolveModelChoice` from `@/lib/agent/llm/models`, `getAiSdkTools` from `@/lib/agent/llm/tools`, `costFor` from `@/lib/agent/llm/pricing`. Keep `dispatchTool` import only if still referenced by the inline-block extraction path (the AI SDK runs execute internally now — likely no longer needed directly; grep before removing).
- Keep EVERY pre-stream concern byte-for-byte: getClaims/401, chatRateLimit/429, params await, sendBodySchema validation/400, thread ownership RLS + explicit user_id check (403/404), prior-message load, persist user message, assistant placeholder insert, checkCostCap + includeWriteTools, buildSystemPrompt fallback. The ONLY change is what happens inside the ReadableStream start().
- Compute the model once: `const choice = resolveModelChoice("ORCHESTRATOR")`. Use `choice.modelId` for the assistant placeholder `model_id` insert (replace the hardcoded `"claude-opus-4-7"`) and for the finalize update.
- Replace the manual `anthropic.messages.stream` MAX_TOOL_ITERATIONS loop with a single `streamText({ model: resolveModel("ORCHESTRATOR"), system: systemPrompt, messages: allMessages, tools: getAiSdkTools(includeWriteTools, agentCtx), stopWhen: stepCountIs(5), maxTokens: choice.maxTokens })`. Build `getAiSdkTools(includeWriteTools, agentCtx)` HERE, inside start(), with the per-request agentCtx ({ userId, automationLevel: "L2", threadId }) — closure, never a singleton.
- Iterate `result.fullStream` (confirm part names against installed v5):
  - text-delta parts -> accumulate into `accumulatedContent` and enqueue `data: {"text": <delta>}\n\n` (unchanged shape).
  - tool-result parts -> the tool's execute returned a ToolResult; run the SAME `JSON.parse(result.content)` -> `if (parsed.inline_block_type === "workflow_plan")` -> set inlineBlockType/inlineBlockPayload and enqueue `data: {"inline_block_type":..., "inline_block_payload":...}\n\n` (unchanged shape). Wrap in try/catch like today (non-JSON ignored).
  - read usage at finish: totalInputTokens/totalOutputTokens from the finish part's `inputTokens`/`outputTokens`.
- Finalize: `const costUsd = costFor(choice.modelId, totalInputTokens, totalOutputTokens)` (replaces the hardcoded 3/15 math). recordCost(userId, costUsd). Persist accumulatedContent + status complete + token_input/token_output + inline block + model_id: choice.modelId, exactly as today. Update thread last_message_at. Emit `data: [DONE]\n\n` and close.
- Error path unchanged: emit `data: {"error":"stream_error","message":<string>}\n\n`, close, mark assistant message errored. (Optionally route the caught error through classifyAgentError if it adds value, but do NOT change the SSE error shape.)
- Preserve the `dispatchTool` never-throws contract: tool failures must surface as correctable tool results to the model, not crash the stream — the AI SDK's execute wrapping dispatchTool already returns a ToolResult on error, so a thrown tool error should not escape; confirm the loop continues across tool errors.

Test (tests/integration/chat-stream.test.ts):
- Replace the `vi.mock("@anthropic-ai/sdk", ...)` FakeStream block. Mock the new boundary instead: `vi.mock("ai", ...)` returning a fake `streamText` whose `fullStream` async-iterates two text-delta parts (text "Hello " then "from the agent.") and a finish part with usage `{ inputTokens: 100, outputTokens: 50 }`, plus `stepCountIs: () => () => true` (or the installed signature). Also mock `@/lib/agent/llm/models` (`resolveModel` -> dummy, `resolveModelChoice` -> `{ provider:"anthropic", modelId:"claude-opus-4-7", maxTokens:4096 }`), `@/lib/agent/llm/tools` (`getAiSdkTools` -> `{}`), `@/lib/agent/llm/pricing` (`costFor` -> 0). Update the `@/lib/agent/tools/index` mock to drop `getAnthropicToolDefinitions` if the route no longer imports it (keep dispatchTool/getToolDefinitions for the CR-05 test that imports dispatchTool directly).
- KEEP every existing assertion: 401/429/content-type/`{ text }` SSE shape (dataLines parse to objects with a string `text` prop), the CONV-09 composer-queue/draft tests (they touch components/chat/composer, unaffected), CR-08 mapping, and the CR-05 dispatchTool-callable test. Match the new mock so `data: {"text": ...}` lines still appear and `[DONE]` is emitted.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run tests/integration/chat-stream.test.ts && grep -v '^#' app/api/chat/\[threadId\]/send/route.ts | grep -c "resolveModel\|getAiSdkTools\|streamText" && node -e "const s=require('fs').readFileSync('app/api/chat/[threadId]/send/route.ts','utf8'); if(/getAnthropicToolDefinitions|anthropic\.messages\.stream/.test(s)){console.error('legacy Anthropic path still present'); process.exit(1)} else console.log('route migrated')"</automated>
  </verify>
  <done>Chat route uses streamText with resolveModel("ORCHESTRATOR"), per-request getAiSdkTools closure, stopWhen: stepCountIs(5), costFor, and persists model_id from resolveModelChoice. All four SSE shapes (`{text}`, inline-block, `[DONE]`, `{error,message}`) are byte-for-byte unchanged. No `anthropic.messages.stream` / `getAnthropicToolDefinitions` references remain in the route. chat-stream.test.ts mocks `ai`/`models`/`tools`/`pricing` instead of `@anthropic-ai/sdk` and all its assertions pass. tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate the 3 messages.create sites, update their 2 test mocks, delete dead streamChat()</name>
  <files>lib/integrations/gmail/classify.ts, lib/inngest/functions/catalog-audit.ts, app/app/settings/actions.ts, lib/agent/runtime.ts, tests/unit/gmail-sync.test.ts, tests/unit/catalog-audit.test.ts, tests/unit/settings.test.ts</files>
  <action>
Migrate the three non-streaming `messages.create` sites to `generateText`, move the THREE affected test mocks (gmail-sync mocks @/lib/agent/anthropic; catalog-audit and settings mock `new Anthropic()` from @anthropic-ai/sdk — all three break when the sites switch to generateText), and delete the dead streamChat(). Note: the approved plan said "two mocks" but a codebase scan found FOUR Anthropic-SDK-boundary test files total — chat-stream (handled in Task 2) plus these three; do all three here. Pair each site with its test so the suite stays green.

1. lib/integrations/gmail/classify.ts (CLASSIFIER role):
   - Replace `import { anthropic }` + `anthropic.messages.create({...})` with `generateText({ model: resolveModel("CLASSIFIER"), system: "<same classifier system prompt>", messages: [{ role:"user", content: \`Subject: ${subject}\nSnippet: ${snippet}\` }], maxTokens: 10 })`. Import resolveModel from @/lib/agent/llm/models.
   - Read `.text` off the result. Keep the EXACT coercion: `const text = (result.text ?? "").trim().toUpperCase(); return text.startsWith("YES");`.

2. lib/inngest/functions/catalog-audit.ts (AUDIT role):
   - In buildAuditSuggestions, replace `const client = new Anthropic(); client.messages.create({...})` with `generateText({ model: resolveModel("AUDIT"), messages: [{ role:"user", content: prompt }], maxTokens: 1024 })`. Import resolveModel; drop `import Anthropic from "@anthropic-ai/sdk"` if now unused (grep — Anthropic may be referenced nowhere else in this file).
   - Replace the content-block extraction (`response.content.filter(...text...)`) with `const rawText = result.text ?? ""`. Keep EVERYTHING downstream identical: the `/\[[\s\S]*\]/` JSON-array regex, JSON.parse, Array.isArray guard, per-item structural validation, and the getDefaultSeoSuggestions() fallbacks (no-match, parse-throw, non-array, <3 results).

3. app/app/settings/actions.ts (DRAFTER role) — regenerateBrandVoice:
   - Replace `const client = new Anthropic(); client.messages.create({ model:"claude-opus-4-5", ... })` with `generateText({ model: resolveModel("DRAFTER"), messages: [{ role:"user", content: <same brand-voice prompt> }], maxTokens: 1024 })`. Import resolveModel; drop the `new Anthropic` usage / Anthropic import if now unused in this file (grep first).
   - Read `.text`. Keep T-4-03-04 behavior EXACTLY: return `{ draft: result.text }` ONLY — no DB write. Preserve the empty/failed-generation guard returning `{ error: "Failed to generate brand voice draft. Please try again." }` when text is empty.

4. lib/agent/runtime.ts — delete dead code:
   - Delete `streamChat()` and (after grep-confirming each is orphaned) `ChatContext`, `ChatResult`, `COST_WARNING`, and the now-unused `getAnthropicToolDefinitions` import.
   - KEEP `classifyAgentError` and its `Anthropic.APIError` branch UNCHANGED (agent-errors.test.ts depends on it), and KEEP runWorkflowStep + WorkflowStepContext/WorkflowStepResult (untouched — no model call). Optionally add an ADDITIVE branch recognizing the AI SDK `APICallError` (status 401 -> auth_error; 429/5xx -> transient) before the final rethrow — additive only, must not alter the existing Anthropic branch or its tests.

5. tests/unit/gmail-sync.test.ts:
   - The classifier no longer calls `@/lib/agent/anthropic`. Replace the `vi.mock("@/lib/agent/anthropic", ...)` with `vi.mock("ai", () => ({ generateText: vi.fn().mockResolvedValue({ text: "YES" }) }))` and mock `@/lib/agent/llm/models` (`resolveModel` -> dummy). Update the assertion "classifies ... using Anthropic fast-path": assert the new `generateText` mock was called (import from `ai`) instead of `anthropic.messages.create`. Keep INTEG-05 sync/cursor assertions intact.

6. tests/unit/catalog-audit.test.ts:
   - Replace `vi.mock("@anthropic-ai/sdk", ...)` (the MockAnthropic with messages.create returning the JSON-array text) with `vi.mock("ai", () => ({ generateText: vi.fn().mockResolvedValue({ text: JSON.stringify([...same 3 suggestions...]) }) }))` and mock `@/lib/agent/llm/models` (resolveModel -> dummy). Keep all buildAuditSuggestions/emptyStoreSuggestions/prompt-injection assertions intact (they assert on returned suggestion shape, not the SDK).

7. tests/unit/settings.test.ts:
   - Replace `vi.mock("@anthropic-ai/sdk", ...)` (MockAnthropic returning the "# Generated Voice" markdown) with `vi.mock("ai", () => ({ generateText: vi.fn().mockResolvedValue({ text: "# Generated Voice\n\nWarm, direct, and human." }) }))` and mock `@/lib/agent/llm/models`. Keep SET-02 / T-4-03-04 assertions (regenerateBrandVoice returns { draft } and does NOT call DB update) intact.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run tests/unit/gmail-sync.test.ts tests/unit/catalog-audit.test.ts tests/unit/settings.test.ts tests/unit/agent-errors.test.ts && node -e "const fs=require('fs'); for (const f of ['lib/integrations/gmail/classify.ts','lib/inngest/functions/catalog-audit.ts','app/app/settings/actions.ts']){const s=fs.readFileSync(f,'utf8'); if(/messages\.create/.test(s)){console.error('messages.create still in '+f); process.exit(1)}} const rt=fs.readFileSync('lib/agent/runtime.ts','utf8'); if(/streamChat/.test(rt)){console.error('dead streamChat still present'); process.exit(1)} if(!/classifyAgentError/.test(rt)){console.error('classifyAgentError missing'); process.exit(1)} console.log('migration ok')"</automated>
  </verify>
  <done>All three sites use generateText({ model: resolveModel(<ROLE>) }) and read `.text`, preserving each one's exact parse/coercion (classifier YES/NO startsWith; catalog-audit JSON-array regex + getDefaultSeoSuggestions fallbacks; brand-voice draft-only). No `messages.create` remains in those three files. streamChat() + orphaned ChatContext/ChatResult/COST_WARNING deleted from runtime.ts; classifyAgentError + runWorkflowStep kept. gmail-sync, catalog-audit, settings tests mock `ai`/`models` and pass; agent-errors.test.ts still green. tsc clean.</done>
</task>

<task type="auto">
  <name>Task 4: Full-suite + build gate, confirm anthropic-default behavior unchanged</name>
  <files>(no new source — verification + any final fixups across migrated files)</files>
  <action>
Final gate. Run the entire test suite and a production build to prove nothing regressed and the anthropic default is byte-for-byte unchanged.

1. Run `npx vitest run` (full suite — baseline ~351 tests; current repo scan counts ~354 `it/test` blocks; the count must not DROP below baseline — no tests silently deleted). Confirm `sdk-smoke.test.ts` and `agent-errors.test.ts` are green and UNTOUCHED (they protect the kept lib/agent/anthropic.ts singleton + Anthropic.APIError path).
2. Run `npm run build` — must succeed under TS strict with the migrated route + new modules.
3. If anything fails, fix within the already-migrated files only — do NOT change scope, do NOT touch the forbidden files (embeddings.ts, memory.ts, message-stream.tsx, anthropic.ts).
4. Sanity self-check (no code change): MODEL_PROFILE unset/=anthropic resolves ORCHESTRATOR=claude-opus-4-7, CLASSIFIER/AUDIT=claude-haiku-4-5, DRAFTER=claude-opus-4-5 (matching the pre-migration hardcoded models) — confirm by reading models.ts PROFILES, so the default path is provably zero-behavior-change.

Manual verification (human, post-merge — record in summary, not blocking the automated gate): with default `anthropic` + `npm run dev`, send a catalog question (streaming text renders) and ask for a workflow (workflow_plan inline block renders). Then flip MODEL_PROFILE=mixed then groq, restart, repeat — confirm a tool fires and dispatchTool doesn't reject args; flip back to anthropic. Spot-check cost is lower under groq than opus for an equivalent turn.
  </action>
  <verify>
    <automated>cd /Users/abhisingh/my-os/dev/Operator-Zero && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>Full `npx vitest run` passes with test count >= baseline (~351; no tests deleted), including sdk-smoke + agent-errors untouched and green. `npm run build` succeeds. models.ts anthropic profile matches the previously-hardcoded model ids per role (proves zero-behavior-change default). Manual dev verification steps recorded in the summary.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> chat route | Untrusted message body crosses here (validated by sendBodySchema, auth, rate limit — all preserved) |
| model -> dispatchTool | Untrusted tool-call args from the LLM cross here; Zod safeParse in dispatchTool is the only entry to execute() — preserved via getAiSdkTools delegating to dispatchTool |
| app -> Groq/Anthropic API | Server-only API keys (GROQ_API_KEY / ANTHROPIC_API_KEY) cross here; never NEXT_PUBLIC_ |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ebw-01 | Information Disclosure | getAiSdkTools ctx binding | mitigate | Build getAiSdkTools per-request with ctx (userId/threadId) captured in a closure; never a module-level singleton — prevents one user's tools executing under another user's identity |
| T-ebw-02 | Tampering | model tool-call args | mitigate | Each AI SDK tool's execute delegates to dispatchTool, preserving Zod safeParse validation + the never-throws correctable-error contract; retiring zodToJsonSchemaShape gives the model a CORRECT schema (was advertising all params as string), reducing malformed-arg risk |
| T-ebw-03 | Information Disclosure | GROQ_API_KEY / ANTHROPIC_API_KEY | mitigate | Keys read server-side only in models.ts (process.env, no NEXT_PUBLIC_); .env.local.example carries placeholders only |
| T-ebw-04 | Spoofing/Tampering | persisted cost + model_id | mitigate | costFor() DEFAULT falls back to Opus rates so an unknown/spoofed modelId never under-bills; model_id persisted from server-resolved resolveModelChoice, not from client |
| T-ebw-SC | Tampering | npm installs (ai, @ai-sdk/anthropic, @ai-sdk/groq) | accept | First-party Vercel (`ai`, `@ai-sdk/*`) packages — well-known, high-trust publishers; install at pinned matching majors. No [ASSUMED]/[SUS] packages introduced |
</threat_model>

<verification>
- `npx tsc --noEmit` clean after every task (strict mode).
- Per-task vitest runs green; full `npx vitest run` green at Task 4 with count >= ~351 baseline.
- `npm run build` succeeds.
- No `messages.create` / `anthropic.messages.stream` / `getAnthropicToolDefinitions` / `streamChat` references remain in migrated files.
- Forbidden files untouched: lib/agent/embeddings.ts, lib/agent/memory.ts, components/chat/message-stream.tsx, lib/agent/anthropic.ts.
- SSE event shapes (`{text}`, `{inline_block_type,inline_block_payload}`, `[DONE]`, `{error,message}`) byte-for-byte preserved.
- Manual (post-merge): anthropic default = streaming + workflow_plan inline block render; flip to mixed/groq routes orchestrator and tools still fire; flip back proves config-only + reversible.
</verification>

<success_criteria>
- Provider abstraction (resolveModel/resolveModelChoice) + per-role routing live behind MODEL_PROFILE / OZ_MODEL_<ROLE>, default anthropic = zero behavior change.
- Chat route + 3 create sites run on the Vercel AI SDK; dead streamChat() removed; classifyAgentError + runWorkflowStep kept.
- getAiSdkTools built per-request with ctx closure (no wrong-user risk); dispatchTool Zod validation + inline-block JSON-string parse preserved.
- Embeddings stay on Voyage; @anthropic-ai/sdk@0.97.1 retained; no `openai` dep.
- Full suite green (>= baseline) + build clean; four SDK-boundary test mocks moved onto the new path.
</success_criteria>

<output>
Create `.planning/quick/260527-ebw-model-routing-anthropic-groq-via-ai-sdk/260527-ebw-SUMMARY.md` when done.
</output>
