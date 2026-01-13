import { describe, expect, it } from "vitest";
import {
  getReminderTypesToSend,
  REMINDER_WINDOWS_HOURS,
  hoursUntil,
  isWithinWindow,
} from "../convex/reminder_logic";

function utc(y: number, m: number, d: number, hh: number, mm: number, ss = 0) {
  // JS Date month is 0-based
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
}

/**
 * Simulates what convertComponentsToTimezoneUTC produces:
 * Given a local time in a timezone, return the equivalent UTC ISO string.
 * For simplicity, we'll use a fixed offset (PST = UTC-8, PDT = UTC-7).
 */
function simulateTimezoneConversion(
  y: number, m: number, d: number, hh: number, mm: number,
  offsetHours: number // e.g., -8 for PST, -7 for PDT
): string {
  // The appointment is at hh:mm in local time
  // UTC = local time - offset (since offset is negative for US timezones)
  const utcDate = new Date(Date.UTC(y, m - 1, d, hh - offsetHours, mm, 0));
  return utcDate.toISOString();
}

describe("reminder logic", () => {
  describe("window constants sanity checks", () => {
    it("24h window is a tight day-before window (~20 minutes)", () => {
      const window24h = REMINDER_WINDOWS_HOURS["24h"];
      const windowMinutes = (window24h.endExclusive - window24h.startInclusive) * 60;
      expect(windowMinutes).toBeCloseTo(20, 5);
    });
  });

  describe("24h reminder edge cases", () => {
    it("sends 24h reminder at 23h55m before appointment (inside window)", () => {
      const appointment = utc(2026, 1, 11, 12, 0, 0);
      const now = utc(2026, 1, 10, 12, 5, 0); // 23h55m before
      expect(
        getReminderTypesToSend({ now, appointmentDateTime: appointment, alreadySent: {} })
      ).toContain("24h");
    });

    it("sends 24h reminder at 24h05m before appointment (inside window)", () => {
      const appointment = utc(2026, 1, 11, 12, 0, 0);
      const now = utc(2026, 1, 10, 11, 55, 0); // 24h05m before
      expect(
        getReminderTypesToSend({ now, appointmentDateTime: appointment, alreadySent: {} })
      ).toContain("24h");
    });

    it("does NOT send 24h reminder at 23h40m before appointment (too late)", () => {
      const appointment = utc(2026, 1, 11, 12, 0, 0);
      const now = utc(2026, 1, 10, 12, 20, 0); // 23h40m before
      expect(
        getReminderTypesToSend({ now, appointmentDateTime: appointment, alreadySent: {} })
      ).not.toContain("24h");
    });

    it("does NOT send 24h reminder at 24h15m before appointment (too early)", () => {
      const appointment = utc(2026, 1, 11, 12, 0, 0);
      const now = utc(2026, 1, 10, 11, 45, 0); // 24h15m before
      expect(
        getReminderTypesToSend({ now, appointmentDateTime: appointment, alreadySent: {} })
      ).not.toContain("24h");
    });
  });

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

    // Exactly 55 minutes before -> in 1h window
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 10, 11, 5, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).toContain("1h");

    // Exactly 65 minutes before -> NOT in 1h window (endExclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 10, 10, 55, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).not.toContain("1h");

    // Exactly 23h50m before -> in 24h window (startInclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 9, 12, 10, 0), // appt at noon next day = 23h50m away
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).toContain("24h");

    // Exactly 24h10m before -> NOT in 24h window (endExclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 9, 11, 50, 0),
        appointmentDateTime: appt,
        alreadySent: {},
      })
    ).not.toContain("24h");

    // 23h40m before -> NOT in 24h window (below startInclusive)
    expect(
      getReminderTypesToSend({
        now: utc(2026, 1, 9, 12, 20, 0), // appt at noon next day = 23h40m away
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
    const now = utc(2026, 1, 10, 11, 5, 0); // 55m window

    expect(
      getReminderTypesToSend({
        now,
        appointmentDateTime: appt,
        alreadySent: { "1h": true },
      })
    ).toEqual([]);
  });
});

describe("UTC/timezone handling", () => {
  it("hoursUntil works correctly with ISO strings parsed as Date objects", () => {
    // Simulates the flow in markReminderSentIfInWindow:
    // appointmentDateTime is a UTC ISO string, now is new Date()
    
    // Appointment at 2 PM Pacific (UTC-8) on Jan 15 = 10 PM UTC on Jan 15
    const appointmentISO = simulateTimezoneConversion(2026, 1, 15, 14, 0, -8);
    const appointmentDate = new Date(appointmentISO);
    
    // "Now" is 2 AM UTC on Jan 15 (6 PM Pacific Jan 14)
    const now = utc(2026, 1, 15, 2, 0, 0);
    
    // Hours until: 10 PM UTC - 2 AM UTC = 20 hours
    const hours = hoursUntil(appointmentDate, now);
    expect(hours).toBeCloseTo(20, 1);
  });

  it("booking at 2 PM Pacific for 2 PM Pacific tomorrow (24h) is in 24h window", () => {
    // User in Pacific time books at 2 PM for 2 PM tomorrow
    // 2 PM Pacific = 10 PM UTC
    const nowPacific = simulateTimezoneConversion(2026, 1, 14, 14, 0, -8); // Jan 14, 2 PM Pacific
    const now = new Date(nowPacific);
    
    const appointmentPacific = simulateTimezoneConversion(2026, 1, 15, 14, 0, -8); // Jan 15, 2 PM Pacific  
    const appointmentDate = new Date(appointmentPacific);
    
    const hours = hoursUntil(appointmentDate, now);
    expect(hours).toBeCloseTo(24, 1);
    expect(isWithinWindow("24h", hours)).toBe(true); // 24h is within 23h50m–24h10m window
  });

  it("booking at 10 AM Eastern for 8 PM Pacific same day is NOT in 24h window (too close)", () => {
    // 13 hours is too close for the tight 24h window.
    const nowISO = "2026-01-15T15:00:00.000Z"; // 10 AM Eastern
    const now = new Date(nowISO);
    const appointmentISO = "2026-01-16T04:00:00.000Z"; // 8 PM Pacific = 4 AM UTC next day
    const appointmentDate = new Date(appointmentISO);
    const hours = hoursUntil(appointmentDate, now);
    expect(hours).toBeCloseTo(13, 1);
    expect(isWithinWindow("24h", hours)).toBe(false);
  });

  it("markReminderSentIfInWindow pattern correctly identifies within-window bookings", () => {
    // This simulates what markReminderSentIfInWindow does
    const appointmentDateTime = "2026-01-15T22:00:00.000Z"; // 2 PM Pacific
    
    // Test case 1: Booking 24 hours in advance (in window)
    const now1 = new Date("2026-01-14T22:00:00.000Z"); // 24 hours before
    const appt1 = new Date(appointmentDateTime);
    const hours1 = hoursUntil(appt1, now1);
    expect(hours1).toBeCloseTo(24, 1);
    expect(isWithinWindow("24h", hours1)).toBe(true);
    
    // Test case 2: Booking 26 hours in advance (outside window)
    const now2 = new Date("2026-01-14T20:00:00.000Z"); // 26 hours before
    const hours2 = hoursUntil(appt1, now2);
    expect(hours2).toBeCloseTo(26, 1);
    expect(isWithinWindow("24h", hours2)).toBe(false);
    
    // Test case 3: Booking 23.5 hours in advance (outside window - too close)
    const now3 = new Date("2026-01-14T22:30:00.000Z"); // 23.5 hours before
    const hours3 = hoursUntil(appt1, now3);
    expect(hours3).toBeCloseTo(23.5, 1);
    expect(isWithinWindow("24h", hours3)).toBe(false);
  });
});


