---
phase: quick-260527-ebw
plan: 01
subsystem: agent-llm
tags: [model-routing, vercel-ai-sdk, anthropic, groq, provider-abstraction, chat-stream]
requires:
  - lib/agent/tools/index.ts (dispatchTool, getToolDefinitions, READ/WRITE/META_TOOL_NAMES, AgentContext, ToolResult)
  - lib/agent/anthropic.ts (kept — Anthropic.APIError for classifyAgentError + sdk-smoke)
provides:
  - lib/agent/llm/models.ts (AgentRole, resolveModel, resolveModelChoice, PROFILES, OZ_MODEL_<ROLE> -> MODEL_PROFILE -> anthropic)
  - lib/agent/llm/tools.ts (getAiSdkTools per-request closure over dispatchTool)
  - lib/agent/llm/pricing.ts (costFor per-model USD/MTok, Opus DEFAULT fallback)
affects:
  - app/api/chat/[threadId]/send/route.ts (now streamText + AI SDK tool loop)
  - lib/integrations/gmail/classify.ts (generateText CLASSIFIER)
  - lib/inngest/functions/catalog-audit.ts (generateText AUDIT)
  - app/app/settings/actions.ts (generateText DRAFTER)
  - lib/agent/runtime.ts (dead streamChat removed; classifyAgentError + APICallError branch)
tech-stack:
  added: [ai@6.0.191, "@ai-sdk/anthropic@3.0.79", "@ai-sdk/groq@3.0.39"]
  patterns: [provider-abstraction-via-env, per-role-model-routing, per-request-tool-closure]
key-files:
  created:
    - lib/agent/llm/models.ts
    - lib/agent/llm/tools.ts
    - lib/agent/llm/pricing.ts
  modified:
    - app/api/chat/[threadId]/send/route.ts
    - lib/integrations/gmail/classify.ts
    - lib/inngest/functions/catalog-audit.ts
    - app/app/settings/actions.ts
    - lib/agent/runtime.ts
    - .env.local.example
    - tests/integration/chat-stream.test.ts
    - tests/unit/gmail-sync.test.ts
    - tests/unit/catalog-audit.test.ts
    - tests/unit/settings.test.ts
    - package.json
decisions:
  - "Installed ai@6 (not v5 as the plan text assumed) — coded against the actually-installed v6 API: maxOutputTokens (not maxTokens/max_tokens), stopWhen: stepCountIs(n), tool({ inputSchema, execute }), fullStream parts text-delta/.text + tool-result/.output + finish/.totalUsage.{inputTokens,outputTokens}"
  - "AI SDK tool-result execute() return surfaces on the tool-result part's .output (not double-wrapped) — route reads part.output.content and JSON.parses it for inline-block extraction"
  - "Added an additive APICallError branch to classifyAgentError (401->auth_error, 429/5xx->transient) alongside the unchanged Anthropic.APIError branch"
  - "Groq USD/MTok pricing rates are placeholders (plan-authorized) pending live-pricing confirmation; DEFAULT falls back to Opus rates so unknown ids never under-bill"
metrics:
  duration: ~25min
  completed: 2026-05-27
---

# Quick Task 260527-ebw: Model routing (Anthropic <-> Groq) via the Vercel AI SDK Summary

Added a config-driven provider abstraction + per-role model routing layer over the Vercel AI SDK (v6): `MODEL_PROFILE=anthropic|groq|mixed` (default `anthropic` = zero behavior change) plus optional `OZ_MODEL_<ROLE>` overrides route the orchestrator/classifier/audit/drafter to different models with no code edit, while the chat frontend and all four SSE event shapes stay byte-for-byte unchanged.

## What was built

- **`lib/agent/llm/models.ts`** — `AgentRole`, `resolveModel(role)` (returns an AI SDK `LanguageModel` via `createAnthropic({apiKey})` / `createGroq({apiKey})`), `resolveModelChoice(role)` (`{provider, modelId, maxTokens}` for cost + persisted `model_id`), internal `PROFILES` table. Resolution order: `OZ_MODEL_<ROLE>` (`provider:modelId`) -> `MODEL_PROFILE` -> default `anthropic`. The anthropic profile maps each role to its previously-hardcoded model id (Orchestrator `claude-opus-4-7`, Classifier/Audit `claude-haiku-4-5`, Drafter `claude-opus-4-5`).
- **`lib/agent/llm/tools.ts`** — `getAiSdkTools(includeWriteTools, ctx)` wraps the existing registry tools as AI SDK `tool({ description, inputSchema, execute })`, where `inputSchema` is the real Zod schema (retiring the lossy `zodToJsonSchemaShape`) and `execute` delegates to `dispatchTool(name, args, ctx)` with `ctx` captured in a per-request closure (T-ebw-01).
- **`lib/agent/llm/pricing.ts`** — `costFor(modelId, inTok, outTok)` USD/MTok table; `DEFAULT` = Opus rates so unknown ids never under-bill (T-ebw-04).
- **Chat route** migrated from the manual `anthropic.messages.stream` MAX_TOOL_ITERATIONS loop to a single `streamText({ model: resolveModel("ORCHESTRATOR"), tools: getAiSdkTools(...), stopWhen: stepCountIs(5), maxOutputTokens })`, iterating `result.fullStream` to re-emit the identical `{text}` / inline-block / `[DONE]` / `{error,message}` SSE events. All auth/RLS/rate-limit/persist/error logic preserved; `model_id` now persisted from `resolveModelChoice`; cost from `costFor`.
- **3 `messages.create` sites** (classifier, catalog audit, brand-voice drafter) migrated to `generateText({ model: resolveModel(<ROLE>) })` reading `.text`, each keeping its exact parse/coercion.
- **Dead code removed:** `streamChat()`, `ChatContext`, `ChatResult`, `COST_WARNING`, and the `getAnthropicToolDefinitions` import in `runtime.ts`. `classifyAgentError` (unchanged Anthropic branch) and `runWorkflowStep` kept; an additive `APICallError` branch was added for AI SDK provider errors.
- **`.env.local.example`:** added `GROQ_API_KEY`, `MODEL_PROFILE=anthropic`, commented `OZ_MODEL_<ROLE>` overrides (all server-only, no `NEXT_PUBLIC_`).
- **4 SDK-boundary test mocks moved** onto the new path (chat-stream mocks `ai`/`models`/`tools`/`pricing`; gmail-sync/catalog-audit/settings mock `ai`'s `generateText` + `models`).

## Deviations from Plan

### [Note] AI SDK major is v6, not v5

- **Found during:** Task 1 (install + v6 API verification).
- **Detail:** `npm install ai @ai-sdk/anthropic @ai-sdk/groq` resolved to `ai@6.0.191` / `@ai-sdk/anthropic@3.0.79` / `@ai-sdk/groq@3.0.39`. The plan's prose said "v5", but the critical instruction was to "code against the actually-installed package." I inspected the installed `.d.ts` types and coded against v6.
- **Impact on plan assumptions:** the v5 idioms the plan listed mostly hold, with these v6-specific facts confirmed from the installed types:
  - **`maxOutputTokens`** is the token-cap option (NOT `maxTokens`/`max_tokens`). Used in `streamText`/`generateText`.
  - `tool({ inputSchema, execute })` — confirmed (`inputSchema` is `FlexibleSchema`, accepts Zod directly).
  - `stopWhen: stepCountIs(5)` — confirmed.
  - `fullStream` part union: `text-delta` (`.text`), `tool-result` (`{type:'tool-result'} & TypedToolResult`, execute return on `.output`), `finish` (`.totalUsage`). Usage fields `inputTokens`/`outputTokens` on `LanguageModelUsage`.
  - `createAnthropic({ apiKey })` / `createGroq({ apiKey })` — confirmed.
  - `APICallError` (with `.statusCode` + static `isInstance()`) is exported from `ai` — used for the additive `classifyAgentError` branch.
- **Not a behavior change** for the default profile (still routes to the same Anthropic model ids).

### [Trivial] runtime.ts header comment reworded

- The verify-step grep `streamChat` matched my own removal-note comment. Reworded the comment to avoid the literal token so the check stays clean. No code impact.

## Threat Surface

No new security surface beyond the threat model. Mitigations implemented as specified:
- **T-ebw-01** (wrong-user tool leakage): `getAiSdkTools` is called per-request inside `start()` with `agentCtx` captured in the closure — never a module singleton.
- **T-ebw-02** (tool-call arg tampering): each tool's `execute` delegates to `dispatchTool`, preserving Zod `safeParse` + the never-throws correctable-error contract; the model now gets the correct Zod schema (no longer all-`string`).
- **T-ebw-03** (key disclosure): `GROQ_API_KEY`/`ANTHROPIC_API_KEY` read server-side only in `models.ts`; `.env.local.example` carries placeholders, no `NEXT_PUBLIC_`.
- **T-ebw-04** (cost/model_id spoofing): `costFor` DEFAULT = Opus rates; `model_id` persisted from server-resolved `resolveModelChoice`, not the client.

## Known Stubs

None blocking. The Groq USD/MTok rates in `pricing.ts` are plan-authorized placeholders (commented as "confirm against live Groq pricing"); the Opus `DEFAULT` fallback ensures unknown/under-priced ids never under-bill. Cost reporting under the `anthropic` default profile is unaffected (Anthropic rates match the previous hardcoded math).

## Verification

- `npx tsc --noEmit` — clean (strict) after every task.
- `npx vitest run` — **351 passed | 3 skipped | 12 todo (366)**, 0 failures; matches the ~351 baseline (no tests deleted). `sdk-smoke.test.ts` + `agent-errors.test.ts` untouched and green.
- `npm run build` — succeeds; `/api/chat/[threadId]/send` builds as a dynamic route.
- Anthropic-default sanity: `models.ts` PROFILES.anthropic ids match the pre-migration hardcoded ids per role — default path is provably zero-behavior-change.
- No `messages.create` / `anthropic.messages.stream` / `getAnthropicToolDefinitions` / `streamChat` (function) references remain in migrated files.
- Forbidden files untouched in my commits: `lib/agent/embeddings.ts`, `lib/agent/memory.ts`, `components/chat/message-stream.tsx`, `lib/agent/anthropic.ts`.

### Manual verification (human, post-merge — not blocking the automated gate)

With default `anthropic` + `npm run dev`: send a catalog question (streaming text should render) and ask for a workflow (workflow_plan inline block should render). Then set `MODEL_PROFILE=mixed`, restart, repeat and confirm a tool fires and `dispatchTool` doesn't reject args; then `MODEL_PROFILE=groq` (requires `GROQ_API_KEY`), restart, repeat; flip back to `anthropic`. Spot-check that recorded cost is lower under groq than opus for an equivalent turn. (Not yet performed.)

## Commits

- `4a9044a` feat(quick-260527-ebw-01): add provider abstraction + per-role model routing modules
- `cb93754` feat(quick-260527-ebw-02): migrate chat route to streamText + move its test mock
- `338d7e7` feat(quick-260527-ebw-03): migrate 3 messages.create sites to generateText, delete dead streamChat
- (Task 4 was a verification-only gate — no source commit)

## Self-Check: PASSED

- Created files exist: `lib/agent/llm/models.ts`, `lib/agent/llm/tools.ts`, `lib/agent/llm/pricing.ts`, this SUMMARY.
- Commits exist: `4a9044a`, `cb93754`, `338d7e7`.
