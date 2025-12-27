import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { sendSMSWebhook, formatReminder24hMessage, formatReminder1hMessage } from "./webhook_utils";

// Get timezone and hospital address from environment variables
const APPOINTMENT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || 'America/Los_Angeles';
const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';
// Use BASE_URL (not NEXT_PUBLIC_BASE_URL) since Convex doesn't have access to Next.js env vars
// This must be set in Convex dashboard environment variables
// Fallback to NEXT_PUBLIC_BASE_URL for backwards compatibility, but prefer BASE_URL
const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;

// Reminder window constants (in hours before appointment)
// Wider windows ensure reminders aren't missed due to cron timing
const REMINDER_24H_WINDOW_START = 23; // Start checking 23 hours before
const REMINDER_24H_WINDOW_END = 25;   // Stop checking 25 hours before (wider window: 23-25h)
const REMINDER_1H_WINDOW_START = 0.5; // Start checking 30 minutes before
const REMINDER_1H_WINDOW_END = 2;     // Stop checking 2 hours before (wider window: 0.5-2h)


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

    // Query all future appointments
    const allAppointments = await ctx.runQuery(internal.reminders.getAllFutureAppointments, {
      nowISO,
    });

    console.log(`Reminders cron: Found ${allAppointments.length} future appointments`);

    // Process each appointment
    for (const appointment of allAppointments) {
      try {
        const appointmentDate = new Date(appointment.dateTime);
        const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Check if appointment needs 24h reminder
        if (hoursUntilAppointment >= REMINDER_24H_WINDOW_START && hoursUntilAppointment < REMINDER_24H_WINDOW_END) {
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
        if (hoursUntilAppointment >= REMINDER_1H_WINDOW_START && hoursUntilAppointment < REMINDER_1H_WINDOW_END) {
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

      // Query all future appointments
      console.log('TEST: Querying all future appointments...');
      const allAppointments: Array<{
        _id: Id<"appointments">;
        patientId: Id<"patients">;
        dateTime: string;
        teamId: Id<"teams">;
      }> = await ctx.runQuery(internal.reminders.getAllFutureAppointments, {
        nowISO,
      });

      console.log(`TEST: ✅ Found ${allAppointments.length} future appointments`);

      let remindersSent = { "24h": 0, "1h": 0 };

      // Process each appointment
      for (const appointment of allAppointments) {
        try {
          const appointmentDate = new Date(appointment.dateTime);
          const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          
          console.log(`TEST: Processing appointment ${appointment._id} - ${hoursUntilAppointment.toFixed(2)} hours until appointment`);

          // Check if appointment needs 24h reminder
          if (hoursUntilAppointment >= REMINDER_24H_WINDOW_START && hoursUntilAppointment < REMINDER_24H_WINDOW_END) {
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
            if (hoursUntilAppointment >= REMINDER_24H_WINDOW_END) {
              console.log(`TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntilAppointment.toFixed(2)} hours away (>= ${REMINDER_24H_WINDOW_END}h), not in 24h reminder window (${REMINDER_24H_WINDOW_START}-${REMINDER_24H_WINDOW_END}h)`);
            } else if (hoursUntilAppointment < REMINDER_24H_WINDOW_START) {
              console.log(`TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntilAppointment.toFixed(2)} hours away (< ${REMINDER_24H_WINDOW_START}h), not in 24h reminder window (${REMINDER_24H_WINDOW_START}-${REMINDER_24H_WINDOW_END}h)`);
            }
          }

          // Check if appointment needs 1h reminder
          if (hoursUntilAppointment >= REMINDER_1H_WINDOW_START && hoursUntilAppointment < REMINDER_1H_WINDOW_END) {
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
            if (hoursUntilAppointment >= REMINDER_1H_WINDOW_END && hoursUntilAppointment < REMINDER_1H_WINDOW_END + 0.5) {
              console.log(`TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntilAppointment.toFixed(2)} hours away (>= ${REMINDER_1H_WINDOW_END}h), not in 1h reminder window (${REMINDER_1H_WINDOW_START}-${REMINDER_1H_WINDOW_END}h)`);
            } else if (hoursUntilAppointment < REMINDER_1H_WINDOW_START && hoursUntilAppointment >= 0) {
              console.log(`TEST: ⏭️ Appointment ${appointment._id} is ${hoursUntilAppointment.toFixed(2)} hours away (< ${REMINDER_1H_WINDOW_START}h), not in 1h reminder window (${REMINDER_1H_WINDOW_START}-${REMINDER_1H_WINDOW_END}h)`);
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

