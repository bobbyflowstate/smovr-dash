import { convexTest } from "convex-test";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

process.env.SITE_URL = process.env.SITE_URL || "http://localhost:3000";

/** Create a date that is `hoursFromNow` hours after `now`. */
function hoursLater(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** Seed a team + patient + appointment at the given dateTime. */
async function seed(
  t: ReturnType<typeof convexTest>,
  appointmentDateTime: string,
  teamOverrides?: { timezone?: string; hospitalAddress?: string; languageMode?: "en" | "en_es" },
) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Acme Dental",
      timezone: teamOverrides?.timezone,
      hospitalAddress: teamOverrides?.hospitalAddress,
      languageMode: teamOverrides?.languageMode,
    });
    const patientId = await ctx.db.insert("patients", {
      phone: "+15551234567",
      name: "Alice Jones",
      teamId,
    });
    const appointmentId = await ctx.db.insert("appointments", {
      patientId,
      dateTime: appointmentDateTime,
      teamId,
      status: "scheduled",
    });
    return { teamId, patientId, appointmentId };
  });
}

describe("reminders.markReminderSentIfInWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks 24h reminder when appointment is ~24h away (inside 23h50m–24h10m)", async () => {
    const now = new Date("2026-03-10T10:00:00Z");
    vi.setSystemTime(now);

    // Appointment 24 hours from now → inside the 24h suppression window
    const apptTime = hoursLater(now, 24);
    const t = convexTest(schema, modules);
    const { teamId, patientId, appointmentId } = await seed(t, apptTime.toISOString());

    const result = await t.mutation(internal.reminders.markReminderSentIfInWindow, {
      appointmentId,
      patientId,
      appointmentDateTime: apptTime.toISOString(),
      teamId,
    });

    expect(result.marked24h).toBe(true);

    // Verify reminder record was inserted
    const reminder = await t.run(async (ctx) =>
      ctx.db
        .query("reminders")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .first(),
    );
    expect(reminder).not.toBeNull();
    expect(reminder!.source).toBe("booking_confirmation");

    // Verify audit trail entry
    const attempt = await t.run(async (ctx) =>
      ctx.db
        .query("reminderAttempts")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .first(),
    );
    expect(attempt).not.toBeNull();
    expect(attempt!.status).toBe("skipped_booking_confirmation");
  });

  it("marks 1h reminder when appointment is ~1h away (inside 1h–1h15m)", async () => {
    const now = new Date("2026-03-10T10:00:00Z");
    vi.setSystemTime(now);

    // Appointment 1.1 hours from now → inside the 1h suppression window (1h–1h15m)
    const apptTime = hoursLater(now, 1.1);
    const t = convexTest(schema, modules);
    const { teamId, patientId, appointmentId } = await seed(t, apptTime.toISOString());

    const result = await t.mutation(internal.reminders.markReminderSentIfInWindow, {
      appointmentId,
      patientId,
      appointmentDateTime: apptTime.toISOString(),
      teamId,
    });

    // 1h window should be marked; 24h window should not (1.1h is outside 23h50m–24h10m)
    expect(result.marked24h).toBe(false);

    const reminder1h = await t.run(async (ctx) =>
      ctx.db
        .query("reminders")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "1h"),
        )
        .first(),
    );
    expect(reminder1h).not.toBeNull();
    expect(reminder1h!.source).toBe("booking_confirmation");
  });

  it("does not mark any reminders when appointment is 48h away (outside all windows)", async () => {
    const now = new Date("2026-03-10T10:00:00Z");
    vi.setSystemTime(now);

    // Appointment 48 hours from now → outside both windows
    const apptTime = hoursLater(now, 48);
    const t = convexTest(schema, modules);
    const { teamId, patientId, appointmentId } = await seed(t, apptTime.toISOString());

    const result = await t.mutation(internal.reminders.markReminderSentIfInWindow, {
      appointmentId,
      patientId,
      appointmentDateTime: apptTime.toISOString(),
      teamId,
    });

    expect(result.marked24h).toBe(false);

    // No reminder records should exist
    const reminders = await t.run(async (ctx) =>
      ctx.db
        .query("reminders")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .collect(),
    );
    expect(reminders).toHaveLength(0);
  });
});

describe("reminders.checkAndSendReminders timezone behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats reminder message using the team's timezone", async () => {
    const now = new Date("2026-03-10T20:00:00Z"); // 1:00 PM in America/Phoenix
    vi.setSystemTime(now);

    const apptTime = hoursLater(now, 24); // should trigger 24h reminder window
    const t = convexTest(schema, modules);
    const { patientId, appointmentId } = await seed(t, apptTime.toISOString(), {
      timezone: "America/Phoenix",
      hospitalAddress: "123 Main St",
    });
    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      await ctx.db.insert("teamSmsConfig", {
        teamId: appointment!.teamId,
        provider: "mock",
        isEnabled: true,
      });
    });

    await t.action(internal.reminders.checkAndSendReminders, {});

    const attempt = await t.run(async (ctx) =>
      ctx.db
        .query("reminderAttempts")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .filter((q: any) => q.eq(q.field("status"), "succeeded"))
        .first(),
    );

    expect(attempt).not.toBeNull();
    const details = JSON.parse(attempt!.detailsJson || "{}");
    const messageBody = details?.webhook?.messageBody as string;
    expect(typeof messageBody).toBe("string");
    expect(messageBody).toContain("1:00 PM");
    expect(messageBody).not.toContain("8:00 PM");
  });

  it("records failed_precondition when team SMS config is missing", async () => {
    const now = new Date("2026-03-10T20:00:00Z");
    vi.setSystemTime(now);

    const apptTime = hoursLater(now, 24);
    const t = convexTest(schema, modules);
    const { appointmentId } = await seed(t, apptTime.toISOString(), {
      timezone: "America/Phoenix",
      hospitalAddress: "123 Main St",
    });

    await t.action(internal.reminders.checkAndSendReminders, {});

    const attempt = await t.run(async (ctx) =>
      ctx.db
        .query("reminderAttempts")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .first(),
    );

    expect(attempt).not.toBeNull();
    expect(attempt!.status).toBe("failed_precondition");
    expect(attempt!.reasonCode).toBe("TEAM_SMS_CONFIG_NOT_CONFIGURED");
  });

  it("formats 24h reminder message using team's languageMode", async () => {
    const now = new Date("2026-03-10T20:00:00Z");
    vi.setSystemTime(now);

    const apptTime = hoursLater(now, 24);
    const t = convexTest(schema, modules);
    const { appointmentId } = await seed(t, apptTime.toISOString(), {
      timezone: "America/Phoenix",
      hospitalAddress: "123 Main St",
      languageMode: "en",
    });
    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      await ctx.db.insert("teamSmsConfig", {
        teamId: appointment!.teamId,
        provider: "mock",
        isEnabled: true,
      });
    });

    await t.action(internal.reminders.checkAndSendReminders, {});

    const attempt = await t.run(async (ctx) =>
      ctx.db
        .query("reminderAttempts")
        .withIndex("by_appointment_type", (q: any) =>
          q.eq("appointmentId", appointmentId).eq("reminderType", "24h"),
        )
        .filter((q: any) => q.eq(q.field("status"), "succeeded"))
        .first(),
    );

    expect(attempt).not.toBeNull();
    const details = JSON.parse(attempt!.detailsJson || "{}");
    const messageBody = details?.webhook?.messageBody as string;
    expect(typeof messageBody).toBe("string");
    expect(messageBody).toContain("Address:");
    expect(messageBody).not.toContain("Dirección:");
  });
});
