# Walking Skeleton — Operator Zero

**Phase:** 1
**Generated:** 2026-05-21

## Capability Proven End-to-End

A person can sign up (email/password or Google OAuth), be redirected to a session-guarded `/app/home` page that no unauthenticated request can reach, and that page performs one real round-trip to the live Postgres database (reads the signed-in user's `user_profiles` row, creating it on first visit) — all running on a Vercel-deployed build with Sentry + Axiom capturing errors and logs, and an Inngest durable function fireable from the agent tier.

This is the thinnest slice that exercises every production rail Phase 2 will build on: Next.js 15 App Router → Supabase Auth (httpOnly cookie + `getClaims()` middleware) → Drizzle/Supabase Postgres (RLS-enforced read/write) → Inngest durable jobs → Anthropic/Voyage agent tier → Sentry/Axiom observability → Vercel CI/preview deploy.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router, React 19, TypeScript strict) | Locked stack (TECH-SPEC §1.1); RSC + Server Actions are the app's execution model |
| Data layer | Supabase Postgres 16 + pgvector + Drizzle ORM 0.45.2 | Locked stack (TECH-SPEC §1.2, §1.5); Drizzle defines schema, Supabase CLI owns migrations |
| Migration workflow | `drizzle-kit generate` → copy SQL to `supabase/migrations/` → `supabase db push` | RESEARCH.md Pitfall 2 — never `drizzle-kit migrate` against Supabase; CLI is the single migration source of truth |
| Two DB clients | `db` (publishable/authenticated key, RLS enforced) + `serviceDb` (service-role key, RLS bypassed, manual `user_id` filter) | RESEARCH.md Pitfall 7 — web tier uses RLS; Inngest agent tier uses service role and filters in code |
| Auth | Supabase Auth — email/password + Google OAuth; `@supabase/ssr` 0.10.3; httpOnly cookie; 30-day rolling refresh | Locked stack (TECH-SPEC §5.1); `@supabase/ssr` is the only correct App Router integration |
| Server-side session validation | `supabase.auth.getClaims()` — NEVER `getSession()` | RESEARCH.md critical finding #1 — `getSession()` does not re-validate the JWT signature and is unsafe for authorization |
| Token encryption | libsodium-wrappers 0.8.4 `crypto_secretbox_easy`; key from `ENCRYPTION_KEY` env (Supabase secret + Vercel env) | Locked stack (INFRA-04); plaintext never persisted |
| Embedding dimension | `vector(1024)` (Voyage `voyage-4` default) — NOT `vector(1536)` | RESEARCH.md critical finding #2 (Assumptions Log A1); DATA-FLOW.md §4.4 `vector(1536)` is stale |
| Durable jobs | Inngest 4.4.0; serve route at `app/api/inngest/route.ts` with `export const maxDuration = 60` | Locked stack (TECH-SPEC §1.3); RESEARCH.md finding #4 — without maxDuration, steps die at Vercel's 10s default |
| Deployment target | Vercel — deploy on merge to `main`, PR preview deploys, GitHub Actions CI (Vitest + `tsc --noEmit`) | Locked stack (INFRA-01) |
| Observability | Sentry (`@sentry/nextjs` 10.53.1, client + server + edge) + Axiom Vercel log drain | Locked stack (INFRA-08) |
| Directory layout | Single Next.js package; folder boundaries under `app/`, `components/`, `lib/{db,auth,integrations,agent,inngest}`, `supabase/`, `tests/` | TECH-SPEC §1.10 — no monorepo packages in v1 |

## Stack Touched in Phase 1

- [x] Project scaffold — Next.js 16 App Router, TypeScript strict, Tailwind, Vitest, ESLint
- [x] Routing — `(auth)/login`, `(auth)/signup`, `(app)/home` (protected), `auth/callback`, `api/inngest`, `api/health`
- [x] Database — real read AND write: protected `/app/home` reads/creates the signed-in user's `user_profiles` row via Drizzle with RLS enforced
- [x] UI — interactive: signup/login forms wired to Server Actions; "Sign in with Google" button wired to OAuth
- [x] Deployment — Vercel deploy on merge to `main` + PR preview; documented `npm run dev` + `inngest dev` local full-stack run

## Out of Scope (Deferred to Later Slices)

Explicitly NOT in the skeleton — Phase 2+ must not treat these absences as bugs:

- Real Shopify / Gmail OAuth handshakes and syncs (adapters are compile-only skeletons returning `false` / `throw`)
- Onboarding wizard, brand voice, workflows, conversation, activity, approvals (all Phase 2+)
- Active-session listing + "sign out all devices" (AUTH-04/AUTH-05 → Phase 4)
- Per-user daily cost cap (AUTH-07 → Phase 2)
- Real rate-limiting enforcement on chat (chat does not exist yet — Phase 1 ships the limiter module + a self-test only)
- Workflow / activity / memory / brand-voice / conversation tables (only `user_profiles` + `integrations` ship in Phase 1)
- Inngest `waitForEvent` approval pause (Phase 2 — only the durable hello-world checkpoint pattern ships now)
- Password reset, email verification customization (Supabase defaults only)

## Subsequent Slice Plan

Each later phase adds vertical slices on top of this skeleton without renegotiating the decisions above:

- **Phase 2:** A new user signs up → connects Shopify (real OAuth onto the encrypted-token + adapter rails) → completes onboarding → builds a workflow in chat → an L2 workflow runs durably on Inngest and pauses for approval. Adds workflow/conversation/agent/memory tables on the same Drizzle+RLS pattern.
- **Phase 3:** My Workflows portfolio surface, Workflow Detail, Activity log, versioning + revert — read/write surfaces over the Phase 2 data model.
- **Phase 4:** Approval Inbox, full inline approvals, complete Settings (incl. AUTH-04/05 session management, AUTH-07 cost caps), mobile parity, WCAG 2.1 AA.
