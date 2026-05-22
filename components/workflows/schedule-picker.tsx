"use client";

/**
 * components/workflows/schedule-picker.tsx
 * Structured schedule / trigger picker (D-02/WF-11).
 *
 * Sarah never writes cron — this picker maps:
 *   frequency (manual / hourly / daily / weekly / custom) + time-of-day
 *   → a fixed trigger_config JSONB + trigger_type
 *   → calls editWorkflow({ trigger_type, trigger_config })
 *
 * Internally converts to a cron expression for the trigger_config, but the
 * user-facing UI never exposes raw cron (D-02 constraint).
 *
 * ACCESSIBILITY: WCAG 2.1 AA — selects/inputs have aria-labels; form is labeled.
 *
 * SECURITY: no free-text cron input — all trigger_config values are computed
 *   from structured selections; validated server-side by editWorkflow Zod schema.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { editWorkflow } from "@/lib/actions/workflows";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Frequency options (D-02: no raw cron exposed to Sarah) ───────────────────

type Frequency = "manual" | "hourly" | "daily" | "weekly" | "custom";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "manual", label: "Manual (run on demand)" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom interval" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const INTERVAL_OPTIONS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
];

// ─── Build trigger_config from structured inputs (D-02) ────────────────────────

/**
 * Maps the structured picker selections to trigger_config JSONB.
 * Internally uses cron expressions for the scheduler, but the user never sees them.
 * The trigger_config format is: { cron?: string, interval_minutes?: number, description: string }
 */
function buildTriggerConfig(
  frequency: Frequency,
  hour: number,
  dayOfWeek: number,
  intervalMinutes: number
): { trigger_type: string; trigger_config: Record<string, unknown> } {
  switch (frequency) {
    case "manual":
      return {
        trigger_type: "manual",
        trigger_config: { description: "Run on demand" },
      };
    case "hourly":
      return {
        trigger_type: "schedule",
        trigger_config: {
          cron: "0 * * * *", // every hour at minute 0
          description: "Hourly",
        },
      };
    case "daily":
      return {
        trigger_type: "schedule",
        trigger_config: {
          cron: `0 ${hour} * * *`, // daily at <hour>:00
          description: `Daily at ${HOUR_OPTIONS[hour]?.label ?? `${hour}:00`}`,
        },
      };
    case "weekly":
      return {
        trigger_type: "schedule",
        trigger_config: {
          cron: `0 ${hour} * * ${dayOfWeek}`, // weekly on <day> at <hour>:00
          description: `Weekly on ${DAY_OPTIONS.find((d) => d.value === dayOfWeek)?.label ?? "Monday"} at ${HOUR_OPTIONS[hour]?.label ?? `${hour}:00`}`,
        },
      };
    case "custom":
      return {
        trigger_type: "schedule",
        trigger_config: {
          interval_minutes: intervalMinutes,
          description: INTERVAL_OPTIONS.find((o) => o.value === intervalMinutes)?.label ?? `Every ${intervalMinutes} minutes`,
        },
      };
  }
}

/**
 * Infer the Frequency from the current trigger config.
 */
function inferFrequency(
  triggerType: string,
  triggerConfig: Record<string, unknown>
): Frequency {
  if (triggerType === "manual") return "manual";
  if ("interval_minutes" in triggerConfig) return "custom";
  const cron = triggerConfig.cron as string | undefined;
  if (!cron) return "manual";
  if (cron === "0 * * * *") return "hourly";
  if (/^0 \d+ \* \* \d+$/.test(cron)) return "weekly";
  if (/^0 \d+ \* \* \*$/.test(cron)) return "daily";
  return "custom";
}

// ─── SchedulePicker ───────────────────────────────────────────────────────────

interface SchedulePickerProps {
  workflowId: string;
  currentTriggerType: string;
  currentTriggerConfig: Record<string, unknown>;
  onSaved: (patch: {
    trigger_type: string;
    trigger_config: Record<string, unknown>;
  }) => void;
  onClose: () => void;
}

export function SchedulePicker({
  workflowId,
  currentTriggerType,
  currentTriggerConfig,
  onSaved,
  onClose,
}: SchedulePickerProps) {
  const currentFrequency = inferFrequency(currentTriggerType, currentTriggerConfig);
  const currentCron = currentTriggerConfig.cron as string | undefined;

  // Parse hour from existing daily/weekly cron
  const existingHour = currentCron ? parseInt(currentCron.split(" ")[1] ?? "9", 10) : 9;
  const existingDay = currentCron ? parseInt(currentCron.split(" ")[4] ?? "1", 10) : 1;
  const existingInterval = (currentTriggerConfig.interval_minutes as number) ?? 60;

  const [frequency, setFrequency] = useState<Frequency>(currentFrequency);
  const [hour, setHour] = useState(isNaN(existingHour) ? 9 : existingHour);
  const [dayOfWeek, setDayOfWeek] = useState(isNaN(existingDay) ? 1 : existingDay);
  const [intervalMinutes, setIntervalMinutes] = useState(existingInterval);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const { trigger_type, trigger_config } = buildTriggerConfig(
        frequency,
        hour,
        dayOfWeek,
        intervalMinutes
      );
      const result = await editWorkflow(workflowId, { trigger_type, trigger_config });
      if ("error" in result) {
        toast.error(`Could not update schedule: ${result.error}`);
      } else {
        toast.success("Schedule updated");
        onSaved({ trigger_type, trigger_config });
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="schedule-picker-title">
        <DialogHeader>
          <DialogTitle id="schedule-picker-title">Edit schedule</DialogTitle>
          <DialogDescription>
            Choose when this workflow should run. Sarah never writes cron — just
            pick a frequency and time.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}
          aria-label="Schedule settings"
        >
          {/* Frequency */}
          <div>
            <label
              htmlFor="schedule-frequency"
              style={{
                display: "block",
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Frequency
            </label>
            <select
              id="schedule-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              disabled={isPending}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-sm)",
                padding: "7px 10px",
                fontSize: 13.5,
                color: "var(--text)",
                cursor: isPending ? "not-allowed" : "pointer",
              }}
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time of day (daily/weekly) */}
          {(frequency === "daily" || frequency === "weekly") && (
            <div>
              <label
                htmlFor="schedule-hour"
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Time
              </label>
              <select
                id="schedule-hour"
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value, 10))}
                disabled={isPending}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "7px 10px",
                  fontSize: 13.5,
                  color: "var(--text)",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Day of week (weekly only) */}
          {frequency === "weekly" && (
            <div>
              <label
                htmlFor="schedule-day"
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Day
              </label>
              <select
                id="schedule-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                disabled={isPending}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "7px 10px",
                  fontSize: 13.5,
                  color: "var(--text)",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom interval */}
          {frequency === "custom" && (
            <div>
              <label
                htmlFor="schedule-interval"
                style={{
                  display: "block",
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Interval
              </label>
              <select
                id="schedule-interval"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value, 10))}
                disabled={isPending}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "7px 10px",
                  fontSize: 13.5,
                  color: "var(--text)",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
