---
phase: quick-261028-llu
plan: 01
status: complete
commits: [bb1902f, see git log for the follow-up test typing fix]
key-files:
  modified: [lib/rate-limit.ts]
  created: [tests/unit/rate-limit-fail-open.test.ts]
---

# Quick 261028-llu: Rate limiters fail open

Added exported `failOpen(limiter, name)` in lib/rate-limit.ts; both `chatRateLimit` and `sandboxCreateRateLimit` are wrapped. Thrown Redis errors are logged as JSON (`ratelimit.redis_unavailable`, limiter, error, timestamp; no identifier) and return an allow result. Resolved results (including success:false) pass through unchanged. Callers untouched.

## Verification
- `npx tsc --noEmit`: clean (exit 0)
- vitest (rate-limit-fail-open, rate-limit, chat-stream integration): 3 files, 31 tests passed

## Deviations
- [Rule 1] Initial test file had two strict-mode TS2532 errors (`calls[0][0]`); fixed with non-null assertions in a follow-up commit.
