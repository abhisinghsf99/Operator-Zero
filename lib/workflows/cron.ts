/**
 * lib/workflows/cron.ts
 * Pure, dependency-free cron-due check for the scheduled-workflow Inngest tick
 * (WS9 — lib/inngest/functions/scheduled-workflows.ts).
 *
 * Supports exactly the subset of cron expressions this app produces and seeds:
 *   "M H * * *"    daily at minute M, hour H, local to `tz`
 *   "* /N * * * *" (no space in the real expression) — every N minutes
 *   "M H * * D"    weekly on day-of-week D (0=Sunday..6=Saturday), at H:M
 *
 * Anything else (ranges, lists, step values on day-of-month/month, multiple
 * comma-separated values, 6-field expressions, etc.) is unsupported and
 * isCronDue() returns false — a workflow using an unsupported expression
 * simply never auto-fires via the schedule tick. This is a deliberate v1
 * scope cut (WS9), not a bug; every guard is wrapped so isCronDue() never
 * throws on a malformed expression.
 *
 * SEMANTICS:
 *   - "M H * * *" / "M H * * D" (daily / weekly): due once the current local
 *     time-of-day has reached H:M (and, for the weekly form, today is the
 *     matching weekday), AND it has not already fired "today" — i.e.
 *     lastRunAt's local calendar date (in `tz`) is not the same as now's
 *     local calendar date. This is a calendar-day window, not a strict
 *     instant comparison: a run that happened earlier the same day (even
 *     before H:M — e.g. triggered manually) counts as "already ran this
 *     window" and suppresses the auto-fire until the next calendar day. This
 *     also naturally tolerates the tick's own 15-minute polling granularity.
 *   - the every-N-minutes form (minute field "* /N", no space in the real
 *     expression): due once lastRunAt's N-minute slot
 *     (local wall-clock minute-of-day, bucketed into N-minute windows) is
 *     strictly earlier than now's N-minute slot — comparing (calendar date,
 *     slot index) pairs so day boundaries are handled correctly.
 *
 * No external date/timezone library — local wall-clock parts are derived via
 * Intl.DateTimeFormat with the given IANA timezone (built into Node/V8).
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday .. 6 = Saturday */
  weekday: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getLocalParts(date: Date, tz: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_MAP[get("weekday")] ?? 0,
  };
}

function dateKey(p: Pick<LocalParts, "year" | "month" | "day">): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Strict non-negative integer field (e.g. "3", not "*", "3-5", or "1,2"). */
function parseIntStrict(field: string): number | null {
  if (!/^\d+$/.test(field)) return null;
  return Number(field);
}

/**
 * isCronDue — true when `expr` has a scheduled fire due at or before `now`
 * (local to `tz`) that hasn't already been satisfied by `lastRunAt`.
 *
 * Never throws — any parse failure or unsupported expression returns false.
 */
export function isCronDue(
  expr: string,
  tz: string | null | undefined,
  now: Date,
  lastRunAt: Date | null
): boolean {
  try {
    const zone = tz && tz.trim() ? tz : "UTC";
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) return false;

    const [minuteField, hourField, domField, monthField, dowField] = fields as [
      string,
      string,
      string,
      string,
      string,
    ];

    // Only "*" is supported for day-of-month and month.
    if (domField !== "*" || monthField !== "*") return false;

    // ── "*/N * * * *" — every N minutes ────────────────────────────────────
    const everyNMatch = minuteField.match(/^\*\/(\d+)$/);
    if (everyNMatch) {
      if (hourField !== "*" || dowField !== "*") return false;
      const n = Number(everyNMatch[1]);
      if (!Number.isInteger(n) || n <= 0 || n > 1440) return false;

      const nowParts = getLocalParts(now, zone);
      const nowSlot = `${dateKey(nowParts)}-${String(
        Math.floor((nowParts.hour * 60 + nowParts.minute) / n)
      ).padStart(4, "0")}`;

      if (lastRunAt === null) return true;

      const lastParts = getLocalParts(lastRunAt, zone);
      const lastSlot = `${dateKey(lastParts)}-${String(
        Math.floor((lastParts.hour * 60 + lastParts.minute) / n)
      ).padStart(4, "0")}`;

      return lastSlot < nowSlot;
    }

    // ── "M H * * *" (daily) / "M H * * D" (weekly) ─────────────────────────
    const minute = parseIntStrict(minuteField);
    const hour = parseIntStrict(hourField);
    if (minute === null || hour === null) return false;
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return false;

    let targetDow: number | null = null;
    if (dowField !== "*") {
      const parsed = parseIntStrict(dowField);
      if (parsed === null || parsed < 0 || parsed > 6) return false;
      targetDow = parsed;
    }

    const nowParts = getLocalParts(now, zone);

    // Weekly form: only fires on the matching weekday.
    if (targetDow !== null && nowParts.weekday !== targetDow) return false;

    // Not due yet today if the scheduled time-of-day hasn't been reached.
    const nowMinuteOfDay = nowParts.hour * 60 + nowParts.minute;
    const scheduledMinuteOfDay = hour * 60 + minute;
    if (nowMinuteOfDay < scheduledMinuteOfDay) return false;

    if (lastRunAt === null) return true;

    const lastParts = getLocalParts(lastRunAt, zone);
    return dateKey(lastParts) < dateKey(nowParts);
  } catch {
    return false;
  }
}
