import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getReminderTypesToSend } from "../convex/reminder_logic";

function utc(y: number, m: number, d: number, hh: number, mm: number, ss = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
}

function extractCronExpressionFromCronsTs(source: string): string {
  // Matches: crons.cron("name", "CRON_EXPR", internal....)
  const match = source.match(/crons\.cron\(\s*[\s\S]*?,\s*"([^"]+)"\s*,/m);
  if (!match) {
    throw new Error("Could not find cron expression in convex/crons.ts");
  }
  return match[1];
}

function parseMinuteField(expr: string): { kind: "everyN"; n: number } | { kind: "minute0Hourly" } | { kind: "everyMinute" } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Unsupported cron expression format: ${expr}`);

  const minute = parts[0];
  if (minute === "*") return { kind: "everyMinute" };
  if (minute === "0") return { kind: "minute0Hourly" };

  const everyN = minute.match(/^\*\/(\d+)$/);
  if (everyN) {
    const n = Number(everyN[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 60) throw new Error(`Invalid */N minute field: ${minute}`);
    return { kind: "everyN", n };
  }

  throw new Error(`Unsupported minute field: ${minute}`);
}

function nextTickAfter(now: Date, minuteSpec: ReturnType<typeof parseMinuteField>): Date {
  // Work purely in UTC to keep tests stable.
  const d = new Date(now.getTime());
  const sec = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  const minute = d.getUTCMinutes();
  const hour = d.getUTCHours();

  const hasSubMinute = sec !== 0 || ms !== 0;
  const epsilonMinute = hasSubMinute ? minute + 1 : minute; // if not exactly on a minute, advance to next minute boundary

  if (minuteSpec.kind === "everyMinute") {
    // Next whole minute
    const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0, 0));
    if (hasSubMinute) result.setUTCMinutes(minute + 1);
    else result.setUTCMinutes(minute + 1); // strictly after
    return result;
  }

  if (minuteSpec.kind === "minute0Hourly") {
    // Next hour, minute 0 (strictly after `now`)
    const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
    if (minute > 0 || hasSubMinute) {
      base.setUTCHours(hour + 1);
    } else {
      // exactly at HH:00:00.000 -> next hour
      base.setUTCHours(hour + 1);
    }
    return base;
  }

  // everyN minutes within each hour
  const n = minuteSpec.n;
  const nextMultiple = Math.ceil((epsilonMinute + 0.000001) / n) * n; // strictly after if exactly on a multiple
  if (nextMultiple < 60) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, nextMultiple, 0, 0));
  }
  // roll to next hour at minute 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour + 1, 0, 0, 0));
}

describe("reminder cron schedule (spec)", () => {
  it("should be frequent enough that a newly-created appointment within 2h still triggers the 1h reminder window on the next tick", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const cronsTs = fs.readFileSync(path.join(repoRoot, "convex", "crons.ts"), "utf8");
    const cronExpr = extractCronExpressionFromCronsTs(cronsTs);

    const minuteSpec = parseMinuteField(cronExpr);

    // Appointment created at 01:01 for 02:01.
    const createdAt = utc(2026, 1, 10, 1, 1, 0);
    const appointment = utc(2026, 1, 10, 2, 1, 0);

    const nextTick = nextTickAfter(createdAt, minuteSpec);

    const remindersAtNextTick = getReminderTypesToSend({
      now: nextTick,
      appointmentDateTime: appointment,
      alreadySent: {},
    });

    // Spec: the schedule should be frequent enough that the next tick is still within the 1h reminder window.
    // Today this FAILS with hourly cron at minute 0 (next tick is 02:00, only 1 minute left => outside window).
    expect(remindersAtNextTick).toContain("1h");
  });
});


