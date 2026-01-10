export type ReminderType = "24h" | "1h";

export type ReminderWindowsHours = Record<
  ReminderType,
  { startInclusive: number; endExclusive: number }
>;

/**
 * Reminder windows (in hours before appointment).
 *
 * These are intentionally wide to avoid missing reminders due to cron timing.
 * They should match the logic in `convex/reminders.ts`.
 */
export const REMINDER_WINDOWS_HOURS: ReminderWindowsHours = {
  "24h": { startInclusive: 23, endExclusive: 25 },
  "1h": { startInclusive: 0.5, endExclusive: 2 },
};

export function hoursUntil(appointmentDateTime: Date, now: Date): number {
  return (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function getWindowRangeISO(
  now: Date,
  type: ReminderType,
  windows: ReminderWindowsHours = REMINDER_WINDOWS_HOURS
): { startISO: string; endISO: string } {
  const w = windows[type];
  const startISO = new Date(
    now.getTime() + w.startInclusive * 60 * 60 * 1000
  ).toISOString();
  const endISO = new Date(
    now.getTime() + w.endExclusive * 60 * 60 * 1000
  ).toISOString();
  return { startISO, endISO };
}

export function getEligibleReminderRangesISO(
  now: Date,
  windows: ReminderWindowsHours = REMINDER_WINDOWS_HOURS
): Record<ReminderType, { startISO: string; endISO: string }> {
  return {
    "1h": getWindowRangeISO(now, "1h", windows),
    "24h": getWindowRangeISO(now, "24h", windows),
  };
}

export function isWithinWindow(
  type: ReminderType,
  hoursUntilAppointment: number,
  windows: ReminderWindowsHours = REMINDER_WINDOWS_HOURS
): boolean {
  const w = windows[type];
  return (
    hoursUntilAppointment >= w.startInclusive &&
    hoursUntilAppointment < w.endExclusive
  );
}

export function getReminderTypesToSend(args: {
  now: Date;
  appointmentDateTime: Date;
  alreadySent: Partial<Record<ReminderType, boolean>>;
  windows?: ReminderWindowsHours;
}): ReminderType[] {
  const h = hoursUntil(args.appointmentDateTime, args.now);
  if (!isFinite(h) || h < 0) return [];

  const windows = args.windows ?? REMINDER_WINDOWS_HOURS;

  const results: ReminderType[] = [];
  (["24h", "1h"] as const).forEach((type) => {
    if (args.alreadySent[type]) return;
    if (isWithinWindow(type, h, windows)) results.push(type);
  });
  return results;
}


