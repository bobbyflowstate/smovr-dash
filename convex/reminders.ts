import { internalAction, internalMutation, internalQuery } from "./_generated/server";
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
  if (!BASE_URL) {
    console.error('BASE_URL not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid. Please set BASE_URL in Convex dashboard environment variables.');
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
    console.error('Error preparing 24h reminder webhook:', error);
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
  if (!BASE_URL) {
    console.error('BASE_URL not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid. Please set BASE_URL in Convex dashboard environment variables.');
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
    console.error('Error preparing 1h reminder webhook:', error);
    return false;
  }
}

/**
 * Validates quiet hours configuration
 * @returns true if valid, false otherwise
 */
function validateQuietHours(quietStart: number, quietEnd: number): boolean {
  // Quiet hours must be between 0-23
  if (quietStart < 0 || quietStart > 23 || quietEnd < 0 || quietEnd > 23) {
    console.error(`Invalid quiet hours: start=${quietStart}, end=${quietEnd}. Must be between 0-23`);
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
    console.log('Reminders cron: Starting check');

    // Check quiet hours first
    const quietStartStr = process.env.SMS_QUIET_HOURS_START;
    const quietEndStr = process.env.SMS_QUIET_HOURS_END;
    
    if (quietStartStr && quietEndStr) {
      const quietStart = parseInt(quietStartStr);
      const quietEnd = parseInt(quietEndStr);
      
      if (!isNaN(quietStart) && !isNaN(quietEnd)) {
        if (!validateQuietHours(quietStart, quietEnd)) {
          // Invalid quiet hours config - don't send reminders
          console.log('Reminders cron: Invalid quiet hours configuration, skipping reminder check');
          return;
        } else {
          const currentHour = getCurrentHourInTimezone(APPOINTMENT_TIMEZONE);
          
          if (isInQuietHours(currentHour, quietStart, quietEnd)) {
            console.log(`Reminders cron: Skipping - current hour ${currentHour} is in quiet hours (${quietStart}-${quietEnd})`);
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
    console.log(
      `Reminders cron: Found ${allAppointments.length} eligible appointments (1h window: ${appts1h.length}, 24h window: ${appts24h.length})`
    );

    // Process each appointment
    for (const appointment of allAppointments) {
      try {
        const appointmentDate = new Date(appointment.dateTime);
        const hoursUntil = hoursUntilAppointment(appointmentDate, now);

        // Check if appointment needs 24h reminder
        if (isWithinWindow("24h", hoursUntil)) {
          // Check if 24h reminder already sent
          const existingReminder = await ctx.runQuery(
            internal.reminders.checkReminderSent,
            {
              appointmentId: appointment._id,
              reminderType: "24h",
            }
          );

          if (!existingReminder) {
            // Get patient details
            const patient = await ctx.runQuery(internal.reminders.getPatientById, {
              patientId: appointment.patientId,
            });

            if (patient) {
              console.log(`Sending 24h reminder for appointment ${appointment._id}`);
              const success = await sendReminder24hWebhook(
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
                  reminderType: "24h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                });
              }
            }
          }
        }

        // Check if appointment needs 1h reminder
        if (isWithinWindow("1h", hoursUntil)) {
          // Check if 1h reminder already sent
          const existingReminder = await ctx.runQuery(
            internal.reminders.checkReminderSent,
            {
              appointmentId: appointment._id,
              reminderType: "1h",
            }
          );

          if (!existingReminder) {
            // Get patient details
            const patient = await ctx.runQuery(internal.reminders.getPatientById, {
              patientId: appointment.patientId,
            });

            if (patient) {
              console.log(`Sending 1h reminder for appointment ${appointment._id}`);
              const success = await sendReminder1hWebhook(
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
                  reminderType: "1h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing appointment ${appointment._id}:`, error);
        // Continue with next appointment - don't fail entire batch
      }
    }

    console.log('Reminders cron: Finished check');
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

      let remindersSent = { "24h": 0, "1h": 0 };

      // Process each appointment
      for (const appointment of allAppointments) {
        try {
          const appointmentDate = new Date(appointment.dateTime);
          const hoursUntil = hoursUntilAppointment(appointmentDate, now);
          
          console.log(`TEST: Processing appointment ${appointment._id} - ${hoursUntil.toFixed(2)} hours until appointment`);

          // Check if appointment needs 24h reminder
          if (isWithinWindow("24h", hoursUntil)) {
            console.log(`TEST: ⏰ Appointment ${appointment._id} is in 24h reminder window`);
            // Check if 24h reminder already sent
            const existingReminder = await ctx.runQuery(
              internal.reminders.checkReminderSent,
              {
                appointmentId: appointment._id,
                reminderType: "24h",
              }
            );

            if (!existingReminder) {
              // Get patient details
              const patient = await ctx.runQuery(internal.reminders.getPatientById, {
                patientId: appointment.patientId,
              });

              if (patient) {
                console.log(`TEST: 📤 Sending 24h reminder for appointment ${appointment._id} to ${patient.phone}`);
                const success = await sendReminder24hWebhook(
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
                    reminderType: "24h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                  });
                  
                  remindersSent["24h"]++;
                  console.log(`TEST: ✅ 24h reminder sent and recorded for appointment ${appointment._id}`);
                } else {
                  console.log(`TEST: ⚠️ 24h reminder webhook failed for appointment ${appointment._id}`);
                }
              } else {
                console.log(`TEST: ⚠️ Patient not found for appointment ${appointment._id}`);
              }
            } else {
              console.log(`TEST: ⏭️ 24h reminder already sent for appointment ${appointment._id}`);
            }
          } else {
            // Log why 24h reminder wasn't sent
            if (hoursUntil >= REMINDER_WINDOWS_HOURS["24h"].endExclusive) {
              console.log(
                `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (>= ${REMINDER_WINDOWS_HOURS["24h"].endExclusive}h), not in 24h reminder window (${REMINDER_WINDOWS_HOURS["24h"].startInclusive}-${REMINDER_WINDOWS_HOURS["24h"].endExclusive}h)`
              );
            } else if (hoursUntil < REMINDER_WINDOWS_HOURS["24h"].startInclusive) {
              console.log(
                `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (< ${REMINDER_WINDOWS_HOURS["24h"].startInclusive}h), not in 24h reminder window (${REMINDER_WINDOWS_HOURS["24h"].startInclusive}-${REMINDER_WINDOWS_HOURS["24h"].endExclusive}h)`
              );
            }
          }

          // Check if appointment needs 1h reminder
          if (isWithinWindow("1h", hoursUntil)) {
            console.log(`TEST: ⏰ Appointment ${appointment._id} is in 1h reminder window`);
            // Check if 1h reminder already sent
            const existingReminder = await ctx.runQuery(
              internal.reminders.checkReminderSent,
              {
                appointmentId: appointment._id,
                reminderType: "1h",
              }
            );

            if (!existingReminder) {
              // Get patient details
              const patient = await ctx.runQuery(internal.reminders.getPatientById, {
                patientId: appointment.patientId,
              });

              if (patient) {
                console.log(`TEST: 📤 Sending 1h reminder for appointment ${appointment._id} to ${patient.phone}`);
                const success = await sendReminder1hWebhook(
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
                    reminderType: "1h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                  });
                  
                  remindersSent["1h"]++;
                  console.log(`TEST: ✅ 1h reminder sent and recorded for appointment ${appointment._id}`);
                } else {
                  console.log(`TEST: ⚠️ 1h reminder webhook failed for appointment ${appointment._id}`);
                }
              } else {
                console.log(`TEST: ⚠️ Patient not found for appointment ${appointment._id}`);
              }
            } else {
              console.log(`TEST: ⏭️ 1h reminder already sent for appointment ${appointment._id}`);
            }
          } else {
            // Log why 1h reminder wasn't sent (only if it's close enough to be relevant)
            if (
              hoursUntil >= REMINDER_WINDOWS_HOURS["1h"].endExclusive &&
              hoursUntil < REMINDER_WINDOWS_HOURS["1h"].endExclusive + 0.5
            ) {
              console.log(
                `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (>= ${REMINDER_WINDOWS_HOURS["1h"].endExclusive}h), not in 1h reminder window (${REMINDER_WINDOWS_HOURS["1h"].startInclusive}-${REMINDER_WINDOWS_HOURS["1h"].endExclusive}h)`
              );
            } else if (hoursUntil < REMINDER_WINDOWS_HOURS["1h"].startInclusive && hoursUntil >= 0) {
              console.log(
                `TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntil.toFixed(2)} hours away (< ${REMINDER_WINDOWS_HOURS["1h"].startInclusive}h), not in 1h reminder window (${REMINDER_WINDOWS_HOURS["1h"].startInclusive}-${REMINDER_WINDOWS_HOURS["1h"].endExclusive}h)`
              );
            }
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
 * Query: Get all future appointments
 */
export const getAllFutureAppointments = internalQuery({
  args: {
    nowISO: v.string(),
  },
  handler: async (ctx, args) => {
    // Query all appointments where dateTime >= now using the by_dateTime index
    // This is much more efficient than fetching all appointments and filtering in memory
    const allAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_dateTime", (q) => q.gte("dateTime", args.nowISO))
      .collect();
    
    return allAppointments;
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

