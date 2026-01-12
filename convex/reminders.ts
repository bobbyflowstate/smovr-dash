import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { sendSMSWebhook, formatReminder24hMessage, formatReminder1hMessage } from "./webhook_utils";
import {
  REMINDER_WINDOWS_HOURS,
  getEligibleReminderRangesISO,
  hoursUntil as hoursUntilAppointment,
  isWithinWindow,
} from "./reminder_logic";
import { assertDevEnvironment } from "./env";
import {
  logReminderSent,
  logCronStart,
  logCronComplete,
  logCronError,
  logConfigurationError,
  createLogger,
} from "./logger";

// Get timezone and hospital address from environment variables
const APPOINTMENT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/Los_Angeles';
const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';
// Use BASE_URL (not NEXT_PUBLIC_BASE_URL) since Convex doesn't have access to Next.js env vars
// This must be set in Convex dashboard environment variables
// Fallback to NEXT_PUBLIC_BASE_URL for backwards compatibility, but prefer BASE_URL
const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;

// Reminder type constants for type safety
export type ReminderType = "24h" | "1h" | "birthday";
const VALID_REMINDER_TYPES: ReminderType[] = ["24h", "1h", "birthday"];

/**
 * Sends a 24h reminder webhook
 * @returns true if webhook was sent successfully, false otherwise
 */
async function sendReminder24hWebhook(
  appointmentId: Id<"appointments">,
  patientName: string | null,
  patientPhone: string,
  appointmentDate: Date
): Promise<boolean> {
  const logger = createLogger({ appointmentId, reminderType: "24h" });
  
  if (!BASE_URL) {
    logConfigurationError("BASE_URL", "Not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid", {
      appointmentId,
      reminderType: "24h",
    });
    return false;
  }

  try {
    // Format message
    const message = formatReminder24hMessage(
      patientName,
      appointmentDate,
      appointmentId,
      BASE_URL,
      APPOINTMENT_TIMEZONE,
      HOSPITAL_ADDRESS
    );
    
    // Send SMS webhook and return success status
    return await sendSMSWebhook(patientPhone, message);
  } catch (error) {
    logger.error("Error preparing 24h reminder webhook", { appointmentId }, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Sends a 1h reminder webhook
 * @returns true if webhook was sent successfully, false otherwise
 */
async function sendReminder1hWebhook(
  appointmentId: Id<"appointments">,
  patientName: string | null,
  patientPhone: string,
  appointmentDate: Date
): Promise<boolean> {
  const logger = createLogger({ appointmentId, reminderType: "1h" });
  
  if (!BASE_URL) {
    logConfigurationError("BASE_URL", "Not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid", {
      appointmentId,
      reminderType: "1h",
    });
    return false;
  }

  try {
    // Format message
    const message = formatReminder1hMessage(
      patientName,
      appointmentDate,
      appointmentId,
      BASE_URL,
      APPOINTMENT_TIMEZONE,
      HOSPITAL_ADDRESS
    );
    
    // Send SMS webhook and return success status
    return await sendSMSWebhook(patientPhone, message);
  } catch (error) {
    logger.error("Error preparing 1h reminder webhook", { appointmentId }, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Validates quiet hours configuration
 * @returns true if valid, false otherwise
 */
function validateQuietHours(quietStart: number, quietEnd: number): boolean {
  const logger = createLogger({ operation: "validateQuietHours" });
  
  // Quiet hours must be between 0-23
  if (quietStart < 0 || quietStart > 23 || quietEnd < 0 || quietEnd > 23) {
    logConfigurationError("SMS_QUIET_HOURS", `Invalid quiet hours: start=${quietStart}, end=${quietEnd}. Must be between 0-23`, {
      quietStart,
      quietEnd,
    });
    return false;
  }
  return true;
}

/**
 * Checks if current time is within quiet hours
 */
function isInQuietHours(currentHour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart <= quietEnd) {
    // Quiet hours don't span midnight (e.g., 8-22)
    return currentHour >= quietStart && currentHour < quietEnd;
  } else {
    // Quiet hours span midnight (e.g., 22-8)
    return currentHour >= quietStart || currentHour < quietEnd;
  }
}

/**
 * Gets current hour in appointment timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const hour = parts.find(p => p.type === 'hour')?.value || '0';
  return parseInt(hour);
}

/**
 * Scheduled function that runs every hour to check for appointments needing reminders
 */
export const checkAndSendReminders = internalAction({
  handler: async (ctx) => {
    const cronName = "checkAndSendReminders";
    logCronStart(cronName);

    let reminders24hSent = 0;
    let reminders1hSent = 0;
    let reminders24hFailed = 0;
    let reminders1hFailed = 0;
    let appointmentsProcessed = 0;
    let errors = 0;

    try {
      // Check quiet hours first
      const quietStartStr = process.env.SMS_QUIET_HOURS_START;
      const quietEndStr = process.env.SMS_QUIET_HOURS_END;
      
      if (quietStartStr && quietEndStr) {
        const quietStart = parseInt(quietStartStr);
        const quietEnd = parseInt(quietEndStr);
        
        if (!isNaN(quietStart) && !isNaN(quietEnd)) {
            if (!validateQuietHours(quietStart, quietEnd)) {
            // Invalid quiet hours config - don't send reminders
            const logger = createLogger({ cronName });
            logger.warn("Invalid quiet hours configuration, skipping reminder check");
            logCronComplete(cronName, {
              appointmentsProcessed: 0,
              reminders24hSent: 0,
              reminders1hSent: 0,
              reminders24hFailed: 0,
              reminders1hFailed: 0,
              errors: 0,
              skipped: true,
              skipReason: "invalid_quiet_hours_config",
            });
            return;
          } else {
            const currentHour = getCurrentHourInTimezone(APPOINTMENT_TIMEZONE);
            
            if (isInQuietHours(currentHour, quietStart, quietEnd)) {
              const logger = createLogger({ cronName });
              logger.info("Skipping reminder check - in quiet hours", {
                currentHour,
                quietStart,
                quietEnd,
              });
              logCronComplete(cronName, {
                appointmentsProcessed: 0,
                reminders24hSent: 0,
                reminders1hSent: 0,
                reminders24hFailed: 0,
                reminders1hFailed: 0,
                errors: 0,
                skipped: true,
                skipReason: "quiet_hours",
                currentHour,
                quietStart,
                quietEnd,
              });
              return;
            }
          }
        }
      }

      // Get current time
      const now = new Date();
      const nowISO = now.toISOString();

      // Query only appointments that could be eligible for reminder notifications.
      // This keeps cron cheap enough to run frequently (e.g. every minute).
      const ranges = getEligibleReminderRangesISO(now, REMINDER_WINDOWS_HOURS);
      const appts1h = await ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["1h"].startISO,
        endISO: ranges["1h"].endISO,
      });
      const appts24h = await ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["24h"].startISO,
        endISO: ranges["24h"].endISO,
      });

      const allAppointments = [...appts1h, ...appts24h];
      const logger = createLogger({ cronName });
      logger.info("Found eligible appointments", {
        total: allAppointments.length,
        "1h_window": appts1h.length,
        "24h_window": appts24h.length,
      });

      /**
       * Helper function to process a reminder for a given type
       * Returns { sent: boolean, failed: boolean } to track both success and failure
       */
      const processReminder = async (
        reminderType: "24h" | "1h",
        appointment: typeof allAppointments[0],
        appointmentDate: Date,
        hoursUntil: number,
        sendWebhookFn: (appointmentId: Id<"appointments">, patientName: string | null, patientPhone: string, appointmentDate: Date) => Promise<boolean>
      ): Promise<{ sent: boolean; failed: boolean }> => {
        if (!isWithinWindow(reminderType, hoursUntil)) {
          return { sent: false, failed: false }; // Not in window for this reminder type
        }

        // Check if reminder already sent
        const existingReminder = await ctx.runQuery(
          internal.reminders.checkReminderSent,
          {
            appointmentId: appointment._id,
            reminderType,
          }
        );

        if (existingReminder) {
          return { sent: false, failed: false }; // Already sent
        }

        // Get patient details
        const patient = await ctx.runQuery(internal.reminders.getPatientById, {
          patientId: appointment.patientId,
        });

        if (!patient) {
          const logger = createLogger({ cronName, appointmentId: appointment._id });
          logger.warn("Patient not found for appointment", {
            appointmentId: appointment._id,
            patientId: appointment.patientId,
          });
          return { sent: false, failed: false }; // Patient not found - don't count as failure
        }

        // Send webhook
        const success = await sendWebhookFn(
          appointment._id,
          patient.name || null,
          patient.phone,
          appointmentDate
        );

        // Only record reminder if it was sent successfully
        if (success) {
          await ctx.runMutation(internal.reminders.recordReminderSent, {
            appointmentId: appointment._id,
            patientId: appointment.patientId,
            reminderType,
            targetDate: appointment.dateTime,
            teamId: appointment.teamId,
          });
          logReminderSent(reminderType, appointment._id, appointment.patientId, appointment.teamId, true);
          return { sent: true, failed: false };
        } else {
          logReminderSent(reminderType, appointment._id, appointment.patientId, appointment.teamId, false);
          return { sent: false, failed: true };
        }
      };

      // Process each appointment
      for (const appointment of allAppointments) {
        try {
          appointmentsProcessed++;
          const appointmentDate = new Date(appointment.dateTime);
          const hoursUntil = hoursUntilAppointment(appointmentDate, now);

          // Process 24h reminder
          const result24h = await processReminder("24h", appointment, appointmentDate, hoursUntil, sendReminder24hWebhook);
          if (result24h.sent) {
            reminders24hSent++;
          } else if (result24h.failed) {
            reminders24hFailed++;
          }

          // Process 1h reminder
          const result1h = await processReminder("1h", appointment, appointmentDate, hoursUntil, sendReminder1hWebhook);
          if (result1h.sent) {
            reminders1hSent++;
          } else if (result1h.failed) {
            reminders1hFailed++;
          }
        } catch (error) {
          errors++;
          const logger = createLogger({ cronName, appointmentId: appointment._id });
          logger.error("Error processing appointment", { appointmentId: appointment._id }, error instanceof Error ? error : new Error(String(error)));
          // Continue with next appointment - don't fail entire batch
        }
      }

      logCronComplete(cronName, {
        appointmentsProcessed,
        reminders24hSent,
        reminders1hSent,
        reminders24hFailed,
        reminders1hFailed,
        errors,
      });
    } catch (error) {
      logCronError(cronName, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  },
});

// Note: Cron jobs are registered in convex.config.ts

/**
 * TEST FUNCTION: Manually trigger reminder check
 * Call this from Convex dashboard to test the reminder system
 * Usage: In Convex dashboard, go to Functions → reminders → testCheckReminders → Run
 * 
 * To view logs: After running, go to the "Logs" tab in the Convex dashboard
 * The logs will show all console.log statements from this function
 * 
 * Note: This is the same logic as checkAndSendReminders, but can be triggered manually
 */
export const testCheckReminders = internalAction({
  handler: async (ctx): Promise<{ message: string; appointmentsChecked: number; remindersSent: { "24h": number; "1h": number } } | { message: string; currentHour: number; quietHours: string } | { message: string; error: string }> => {
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('TEST: Manually triggering reminder check');
      console.log('═══════════════════════════════════════════════════════');
      
      // Check quiet hours first
      const quietStartStr = process.env.SMS_QUIET_HOURS_START;
      const quietEndStr = process.env.SMS_QUIET_HOURS_END;
      
      console.log(`TEST: Quiet hours config - START: ${quietStartStr || 'not set'}, END: ${quietEndStr || 'not set'}`);
      
      if (quietStartStr && quietEndStr) {
        const quietStart = parseInt(quietStartStr);
        const quietEnd = parseInt(quietEndStr);
        
        if (!isNaN(quietStart) && !isNaN(quietEnd)) {
          if (!validateQuietHours(quietStart, quietEnd)) {
            // Invalid quiet hours config - don't send reminders
            console.log('TEST: ⚠️ Invalid quiet hours configuration, skipping reminder check');
            return { 
              message: 'Skipped due to invalid quiet hours configuration', 
              error: `Invalid quiet hours: start=${quietStart}, end=${quietEnd}. Must be between 0-23` 
            };
          } else {
            const currentHour = getCurrentHourInTimezone(APPOINTMENT_TIMEZONE);
            console.log(`TEST: Current hour in ${APPOINTMENT_TIMEZONE}: ${currentHour}`);
            
            if (isInQuietHours(currentHour, quietStart, quietEnd)) {
              console.log(`TEST: ⚠️ Skipping - current hour ${currentHour} is in quiet hours (${quietStart}-${quietEnd})`);
              return { message: 'Skipped due to quiet hours', currentHour, quietHours: `${quietStart}-${quietEnd}` };
            }
          }
        }
      }

      // Get current time
      const now = new Date();
      const nowISO = now.toISOString();
      console.log(`TEST: Current time: ${nowISO}`);

      // Query only eligible appointments (matches production cron behavior)
      console.log('TEST: Querying eligible appointments (1h + 24h windows)...');
      const ranges = getEligibleReminderRangesISO(now, REMINDER_WINDOWS_HOURS);
      const appts1h = await ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["1h"].startISO,
        endISO: ranges["1h"].endISO,
      });
      const appts24h = await ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["24h"].startISO,
        endISO: ranges["24h"].endISO,
      });

      const allAppointments: Array<{
        _id: Id<"appointments">;
        patientId: Id<"patients">;
        dateTime: string;
        teamId: Id<"teams">;
      }> = [...appts1h, ...appts24h];

      console.log(
        `TEST: ✅ Found ${allAppointments.length} eligible appointments (1h window: ${appts1h.length}, 24h window: ${appts24h.length})`
      );

      /**
       * Helper function to process a reminder for a given type (test version with console logging)
       * Returns true if reminder was sent successfully, false otherwise
       */
      const processReminderTest = async (
        reminderType: "24h" | "1h",
        appointment: typeof allAppointments[0],
        appointmentDate: Date,
        hoursUntil: number,
        sendWebhookFn: (appointmentId: Id<"appointments">, patientName: string | null, patientPhone: string, appointmentDate: Date) => Promise<boolean>
      ): Promise<boolean> => {
        if (!isWithinWindow(reminderType, hoursUntil)) {
          // Log why reminder wasn't sent (only for test function)
          const window = REMINDER_WINDOWS_HOURS[reminderType];
          if (hoursUntil >= window.endExclusive) {
            console.log(
              `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (>= ${window.endExclusive}h), not in ${reminderType} reminder window (${window.startInclusive}-${window.endExclusive}h)`
            );
          } else if (hoursUntil < window.startInclusive && hoursUntil >= 0) {
            console.log(
              `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (< ${window.startInclusive}h), not in ${reminderType} reminder window (${window.startInclusive}-${window.endExclusive}h)`
            );
          }
          return false;
        }

        console.log(`TEST: ⏰ Appointment ${appointment._id} is in ${reminderType} reminder window`);

        // Check if reminder already sent
        const existingReminder = await ctx.runQuery(
          internal.reminders.checkReminderSent,
          {
            appointmentId: appointment._id,
            reminderType,
          }
        );

        if (existingReminder) {
          console.log(`TEST: ⏭️ ${reminderType} reminder already sent for appointment ${appointment._id}`);
          return false;
        }

        // Get patient details
        const patient = await ctx.runQuery(internal.reminders.getPatientById, {
          patientId: appointment.patientId,
        });

        if (!patient) {
          console.log(`TEST: ⚠️ Patient not found for appointment ${appointment._id}`);
          return false;
        }

        console.log(`TEST: 📤 Sending ${reminderType} reminder for appointment ${appointment._id} to ${patient.phone}`);
        const success = await sendWebhookFn(
          appointment._id,
          patient.name || null,
          patient.phone,
          appointmentDate
        );

        // Only record reminder if it was sent successfully
        if (success) {
          await ctx.runMutation(internal.reminders.recordReminderSent, {
            appointmentId: appointment._id,
            patientId: appointment.patientId,
            reminderType,
            targetDate: appointment.dateTime,
            teamId: appointment.teamId,
          });
          console.log(`TEST: ✅ ${reminderType} reminder sent and recorded for appointment ${appointment._id}`);
        } else {
          console.log(`TEST: ⚠️ ${reminderType} reminder webhook failed for appointment ${appointment._id}`);
        }

        return success;
      };

      let remindersSent = { "24h": 0, "1h": 0 };

      // Process each appointment
      for (const appointment of allAppointments) {
        try {
          const appointmentDate = new Date(appointment.dateTime);
          const hoursUntil = hoursUntilAppointment(appointmentDate, now);
          
          console.log(`TEST: Processing appointment ${appointment._id} - ${hoursUntil.toFixed(2)} hours until appointment`);

          // Process 24h reminder
          if (await processReminderTest("24h", appointment, appointmentDate, hoursUntil, sendReminder24hWebhook)) {
            remindersSent["24h"]++;
          }

          // Process 1h reminder
          if (await processReminderTest("1h", appointment, appointmentDate, hoursUntil, sendReminder1hWebhook)) {
            remindersSent["1h"]++;
          }
        } catch (error) {
          console.error(`TEST: ❌ Error processing appointment ${appointment._id}:`, error);
          // Continue with next appointment - don't fail entire batch
        }
      }

      const result = { 
        message: 'Reminder check completed',
        appointmentsChecked: allAppointments.length,
        remindersSent 
      };
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('TEST: ✅ Finished check');
      console.log(`TEST: Result:`, JSON.stringify(result, null, 2));
      console.log('═══════════════════════════════════════════════════════');
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('TEST: ❌ Fatal error in testCheckReminders:', error);
      return { 
        message: 'Error running reminder check',
        error: errorMessage
      };
    }
  },
});

/**
 * Query: Get appointments in a specific dateTime range [startISO, endISO).
 *
 * Uses the `appointments.by_dateTime` index so the query scales with the size of the window,
 * not the total number of future appointments.
 */
export const getAppointmentsInRange = internalQuery({
  args: {
    startISO: v.string(),
    endISO: v.string(),
  },
  handler: async (ctx, args) => {
    const appts = await ctx.db
      .query("appointments")
      .withIndex("by_dateTime", (q) =>
        q.gte("dateTime", args.startISO).lt("dateTime", args.endISO)
      )
      .collect();
    return appts;
  },
});

/**
 * Query: Check if reminder already sent for an appointment
 */
export const checkReminderSent = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
    reminderType: v.union(v.literal("24h"), v.literal("1h"), v.literal("birthday")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_appointment_type", (q) =>
        q.eq("appointmentId", args.appointmentId).eq("reminderType", args.reminderType)
      )
      .first();
    
    return existing !== null;
  },
});

/**
 * Query: Get patient by ID
 */
export const getPatientById = internalQuery({
  args: {
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.patientId);
  },
});

/**
 * Mutation: Record that a reminder was sent
 */
export const recordReminderSent = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    reminderType: v.union(v.literal("24h"), v.literal("1h"), v.literal("birthday")),
    targetDate: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reminders", {
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      reminderType: args.reminderType,
      targetDate: args.targetDate,
      sentAt: new Date().toISOString(),
      teamId: args.teamId,
    });
  },
});

/**
 * PUBLIC Mutation: Mark 24h reminder as "sent" if appointment is booked within the 24h window.
 * 
 * This prevents double-notification when a user books within the 24h window:
 * - They get a schedule confirmation immediately
 * - The cron would also try to send a 24h reminder (redundant)
 * 
 * By recording the 24h reminder as "sent" at booking time, the cron's
 * `checkReminderSent` query returns true and skips the reminder.
 * 
 * Called from the appointments API after creating an appointment.
 */
export const markReminderSentIfInWindow = mutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    appointmentDateTime: v.string(), // ISO string
    teamId: v.id("teams"),
  },
  handler: async (ctx, args): Promise<{ marked24h: boolean }> => {
    const now = new Date();
    const appointmentDate = new Date(args.appointmentDateTime);
    const hoursUntil = hoursUntilAppointment(appointmentDate, now);

    // Check if appointment is within the 24h reminder window
    if (isWithinWindow("24h", hoursUntil, REMINDER_WINDOWS_HOURS)) {
      // Record as if we already sent the 24h reminder (since they got the confirmation)
      await ctx.db.insert("reminders", {
        appointmentId: args.appointmentId,
        patientId: args.patientId,
        reminderType: "24h",
        targetDate: args.appointmentDateTime,
        sentAt: now.toISOString(),
        teamId: args.teamId,
      });
      console.log(
        `Marked 24h reminder as sent for appointment ${args.appointmentId} (booked ${hoursUntil.toFixed(1)}h in advance)`
      );
      return { marked24h: true };
    }

    return { marked24h: false };
  },
});

/**
 * DEV/TEST HELPER: Seed appointments that fall into the reminder windows.
 *
 * This is useful for validating reminder behavior locally with `testCheckReminders`.
 * It creates:
 * - 1 shared team
 * - N patients + appointments ~1 hour away (actually 65 minutes by default)
 * - M patients + appointments ~24 hours away (actually 24h10m by default)
 *
 * Usage:
 * - Convex dashboard → Functions → reminders → seedRemindersTestData → Run
 * - OR CLI: `npx convex run internal.reminders.seedRemindersTestData '{"count1h":2,"count24h":2}'`
 */
export const seedRemindersTestData = internalMutation({
  args: {
    count1h: v.optional(v.number()),
    count24h: v.optional(v.number()),
    minutesFromNowFor1h: v.optional(v.number()),
    minutesFromNowFor24h: v.optional(v.number()),
    reuseTeamName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    teamId: Id<"teams">;
    now: string;
    seeded: {
      "1h": Array<{
        appointmentId: Id<"appointments">;
        patientId: Id<"patients">;
        phone: string;
        name: string;
        dateTime: string;
      }>;
      "24h": Array<{
        appointmentId: Id<"appointments">;
        patientId: Id<"patients">;
        phone: string;
        name: string;
        dateTime: string;
      }>;
    };
    windowsHours: typeof REMINDER_WINDOWS_HOURS;
    note: string;
  }> => {
    // Safety: seeding is for local/dev only.
    assertDevEnvironment("seedRemindersTestData");

    const count1h = args.count1h ?? 2;
    const count24h = args.count24h ?? 2;
    const minutesFromNowFor1h = args.minutesFromNowFor1h ?? 65; // within 0.5h-2h window
    const minutesFromNowFor24h = args.minutesFromNowFor24h ?? (24 * 60 + 10); // within 23h-25h window
    const teamName = args.reuseTeamName ?? "Seed Team";

    const now = new Date();
    const basePhone = 5550100000 + Math.floor(Math.random() * 9000);

    // Create a team (simple and isolated). For dev-only seeding, duplicates are OK.
    const teamId = await ctx.db.insert("teams", { name: teamName });

    const makeAppointment = async (
      i: number,
      minutesFromNow: number
    ): Promise<{
      appointmentId: Id<"appointments">;
      patientId: Id<"patients">;
      phone: string;
      name: string;
      dateTime: string;
    }> => {
      const phone = `+1${basePhone + i}`;
      const patientName = `Seed Patient ${i + 1}`;
      const appointmentDateTime = new Date(now.getTime() + minutesFromNow * 60 * 1000).toISOString();

      const patientId = await ctx.db.insert("patients", {
        phone,
        name: patientName,
        teamId,
      });

      const appointmentId = await ctx.db.insert("appointments", {
        patientId,
        dateTime: appointmentDateTime,
        teamId,
        notes: `Seeded for reminders test (${minutesFromNow}m from now)`,
      });

      return { appointmentId, patientId, phone, name: patientName, dateTime: appointmentDateTime };
    };

    const seeded1h: Array<{
      appointmentId: Id<"appointments">;
      patientId: Id<"patients">;
      phone: string;
      name: string;
      dateTime: string;
    }> = [];
    for (let i = 0; i < count1h; i++) {
      seeded1h.push(await makeAppointment(i, minutesFromNowFor1h));
    }

    const seeded24h: Array<{
      appointmentId: Id<"appointments">;
      patientId: Id<"patients">;
      phone: string;
      name: string;
      dateTime: string;
    }> = [];
    for (let i = 0; i < count24h; i++) {
      // Offset index to avoid duplicate phone numbers between buckets
      seeded24h.push(await makeAppointment(count1h + i, minutesFromNowFor24h));
    }

    return {
      teamId,
      now: now.toISOString(),
      seeded: {
        "1h": seeded1h,
        "24h": seeded24h,
      },
      windowsHours: REMINDER_WINDOWS_HOURS,
      note:
        "Run internal.reminders.testCheckReminders next to see reminders picked up. If GHL_SMS_WEBHOOK_URL is unset, sends are skipped but reminders can still be recorded if sendSMSWebhook returns true.",
    };
  },
});

