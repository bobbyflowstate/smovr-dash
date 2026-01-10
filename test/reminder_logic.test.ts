import { describe, expect, it } from "vitest";
import { getReminderTypesToSend } from "../convex/reminder_logic";

function utc(y: number, m: number, d: number, hh: number, mm: number, ss = 0) {
  // JS Date month is 0-based
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
}

describe("reminder logic", () => {
  it("reproduces the hourly-cron missed 1h reminder case (appointment created after the previous tick)", () => {
    // Appointment scheduled at 01:01 for 02:01.
    // Cron ticks hourly at :00 (01:00, 02:00, ...). The appointment does not exist at 01:00.
    // At 02:00 the appointment is 1 minute away, which is outside the 1h reminder window (>= 0.5h).
    const appointment = utc(2026, 1, 10, 2, 1, 0);

    const tickAt0100 = utc(2026, 1, 10, 1, 0, 0);
    const tickAt0200 = utc(2026, 1, 10, 2, 0, 0);

    // If the appointment existed at 01:00, it WOULD qualify for a 1h reminder.
    expect(
      getReminderTypesToSend({
        now: tickAt0100,
        appointmentDateTime: appointment,
        alreadySent: {},
      })
    ).toContain("1h");

    // But once the appointment is created at 01:01, the first cron tick that can see it is 02:00.
    // At 02:00 it is too close (< 0.5h) so no reminder is sent.
    expect(
      getReminderTypesToSend({
        now: tickAt0200,
        appointmentDateTime: appointment,
        alreadySent: {},
      })
    ).toEqual([]);
  });

  it("treats window boundaries as start-inclusive / end-exclusive", () => {
    const appt = utc(2026, 1, 10, 12, 0, 0);

    // Exactly 0.5 hours before -> in 1h window
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 10, 11, 30, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).toContain("1h");

    // Exactly 2 hours before -> NOT in 1h window (endExclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 10, 10, 0, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).not.toContain("1h");

    // Exactly 23 hours before -> in 24h window
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 9, 13, 0, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).toContain("24h");

    // Exactly 25 hours before -> NOT in 24h window (endExclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 9, 11, 0, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).not.toContain("24h");
  });

  it("does not send reminders for past appointments", () => {
    const now = utc(2026, 1, 10, 12, 0, 0);
    const past = utc(2026, 1, 10, 11, 59, 0);

    expect(
      getReminderTypesToSend({
        now,
        appointmentDateTime: past,
        alreadySent: {},
      })
    ).toEqual([]);
  });

  it("does not return reminder types that are already sent", () => {
    const appt = utc(2026, 1, 10, 12, 0, 0);
    const now = utc(2026, 1, 10, 11, 30, 0); // 0.5h window

    expect(
      getReminderTypesToSend({
        now,
        appointmentDateTime: appt,
        alreadySent: { "1h": true },
      })
    ).toEqual([]);
  });
});


