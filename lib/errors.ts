/**
 * lib/errors.ts
 * Server Action error sanitization (WR-09).
 *
 * Server Actions return their error string straight to the client (Sonner toasts).
 * Forwarding `String(err)` leaks raw Postgres messages, constraint names, and
 * internal stack-derived text — an information-disclosure smell and unfriendly UX.
 *
 * toClientError() logs the raw error server-side and returns ONLY a user-safe
 * message: either a deliberately-surfaced message (SafeError or an allowlisted
 * prefix) or a generic fallback for unexpected/DB errors.
 */

/**
 * SafeError — an error whose message is intentionally safe to show the user.
 * Throw this from Server Actions / lib code for validation and ownership
 * failures that the user should see verbatim.
 */
export class SafeError extends Error {
  readonly isSafe = true as const;
  constructor(message: string) {
    super(message);
    this.name = "SafeError";
  }
}

const GENERIC_MESSAGE = "Something went wrong, please try again.";

/**
 * Known user-safe message prefixes thrown as plain Error elsewhere in the
 * codebase (pre-dating SafeError). These describe ownership / not-found /
 * auth / revert-eligibility conditions and contain no schema or internal
 * details, so they are safe to surface verbatim.
 */
const SAFE_MESSAGE_MATCHERS: RegExp[] = [
  /not found or not owned by user/i,
  /not found or does not belong/i,
  /not authenticated/i,
  /^unauthenticated$/i,
  /already been reverted/i,
  /can't be unsent/i,
  /outside the revert window/i,
  /edited after the agent action/i,
  /revert actions themselves cannot be reverted/i,
];

/**
 * toClientError — convert a caught error into a user-safe message string.
 *
 * - SafeError → its message (verbatim).
 * - plain Error whose message matches a known-safe matcher → its message.
 * - anything else (DB errors, unexpected throws) → generic message; the raw
 *   error is logged server-side for debugging.
 *
 * @param err     The caught error (unknown).
 * @param context Optional label for the server-side log line.
 */
export function toClientError(err: unknown, context?: string): string {
  if (err instanceof SafeError) {
    return err.message;
  }

  if (err instanceof Error && SAFE_MESSAGE_MATCHERS.some((re) => re.test(err.message))) {
    return err.message;
  }

  // Unexpected / DB error — log raw server-side, return a generic message.
  console.error(`[ServerAction error]${context ? ` ${context}:` : ""}`, err);
  return GENERIC_MESSAGE;
}
