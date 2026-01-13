import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { sendSMSWebhookDetailed, formatReminder24hMessage, formatReminder1hMessage, type SMSWebhookResult } from "./webhook_utils";
import {
  REMINDER_WINDOWS_HOURS,
  getEligibleReminderRangesISO,
  hoursUntil as hoursUntilAppointment,
  isWithinWindow,
} from "./reminder_logic";
import { assertDevEnvironment } from "./env";
import {
  BOOKING_SUPPRESS_1H_END,
  BOOKING_SUPPRESS_1H_START,
  BOOKING_SUPPRESS_24H_END,
  BOOKING_SUPPRESS_24H_START,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  isInQuietHours,
  mapWebhookFailureToReason,
  noteForAttempt,
  type ReminderAttemptReasonCode,
  type ReminderAttemptStatus,
} from "./reminder_policies";

const DEFAULT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || "America/Los_Angeles";
const DEFAULT_HOSPITAL_ADDRESS =
  process.env.HOSPITAL_ADDRESS ||
  "123 Medical Center Drive, Suite 456, San Francisco, CA 94102";
// Use BASE_URL (not NEXT_PUBLIC_BASE_URL) since Convex doesn't have access to Next.js env vars
// This must be set in Convex dashboard environment variables
// Fallback to NEXT_PUBLIC_BASE_URL for backwards compatibility, but prefer BASE_URL
const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;

export type ReminderType = "24h" | "1h" | "birthday";
const VALID_REMINDER_TYPES: ReminderType[] = ["24h", "1h", "birthday"];
// Reminder attempt types, constants, and pure policy helpers live in reminder_policies.ts so we can unit test them.

/**
 * Sends a 24h reminder webhook
 * @returns true if webhook was sent successfully, false otherwise
 */
async function sendReminder24hWebhook(
  appointmentId: Id<"appointments">,
  patientName: string | null,
  patientPhone: string,
  appointmentDate: Date,
  timezone: string,
  hospitalAddress: string
): Promise<SMSWebhookResult> {
  try {
    if (!BASE_URL) {
      console.error('BASE_URL not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid. Please set BASE_URL in Convex dashboard environment variables.');
      return {
        ok: false,
        attemptCount: 0,
        httpStatus: null,
        failureReason: "NETWORK_ERROR",
        errorMessage: "BASE_URL_NOT_CONFIGURED",
      };
    }

    // Format message
    const message = formatReminder24hMessage(
      patientName,
      appointmentDate,
      appointmentId,
      BASE_URL,
      timezone,
      hospitalAddress
    );
    
    // Send SMS webhook and return detailed status
    return await sendSMSWebhookDetailed(patientPhone, message);
  } catch (error) {
    console.error('Error preparing 24h reminder webhook:', error);
    return {
      ok: false,
      attemptCount: 0,
      httpStatus: null,
      failureReason: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
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
  appointmentDate: Date,
  timezone: string,
  hospitalAddress: string
): Promise<SMSWebhookResult> {
  try {
    if (!BASE_URL) {
      console.error('BASE_URL not configured in Convex dashboard. Cannot send reminder webhook - SMS links would be invalid. Please set BASE_URL in Convex dashboard environment variables.');
      return {
        ok: false,
        attemptCount: 0,
        httpStatus: null,
        failureReason: "NETWORK_ERROR",
        errorMessage: "BASE_URL_NOT_CONFIGURED",
      };
    }

    // Format message
    const message = formatReminder1hMessage(
      patientName,
      appointmentDate,
      appointmentId,
      BASE_URL,
      timezone,
      hospitalAddress
    );
    
    // Send SMS webhook and return detailed status
    return await sendSMSWebhookDetailed(patientPhone, message);
  } catch (error) {
    console.error('Error preparing 1h reminder webhook:', error);
    return {
      ok: false,
      attemptCount: 0,
      httpStatus: null,
      failureReason: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
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
    // NOTE: Quiet hours are enforced as 10pm–5am in clinic timezone.
    // We intentionally ignore SMS_QUIET_HOURS_START/END env vars here to avoid configuration drift.
    const quietStart = DEFAULT_QUIET_HOURS_START;
    const quietEnd = DEFAULT_QUIET_HOURS_END;
    
    // We no longer early-return during quiet hours. Instead we still compute eligibility
    // and record a durable attempt per appointment/type with a clear "skipped_quiet_hours" reason.
    // Quiet hours are enforced in the *team's* timezone (per appointment).
    const quietHoursValid =
      !isNaN(quietStart) && !isNaN(quietEnd) && validateQuietHours(quietStart, quietEnd);

    console.log(
      `Reminders cron: quietHours=${quietStart}-${quietEnd} valid=${quietHoursValid} (timezone is per-team)`
    );

    if (!quietHoursValid) {
      console.log('Reminders cron: Invalid quiet hours configuration; reminders will be marked failed_precondition');
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

    const noteFor = noteForAttempt;

    const reminderSourceDisplay = (source: unknown): { sourceRaw: string | null; sourceDisplay: string | null } => {
      const raw = typeof source === "string" ? source : null;
      if (!raw) return { sourceRaw: null, sourceDisplay: null };
      if (raw === "booking_confirmation") return { sourceRaw: raw, sourceDisplay: "Booking confirmation" };
      if (raw === "cron" || raw === "automated_check")
        return { sourceRaw: raw, sourceDisplay: "Automated reminder check" };
      return { sourceRaw: raw, sourceDisplay: raw };
    };

    const formatHoursHuman = (hours: number): string => {
      if (!isFinite(hours)) return `${hours}`;
      const totalMinutes = Math.round(hours * 60);
      const h = Math.floor(totalMinutes / 60);
      const m = Math.abs(totalMinutes % 60);
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    };

    const shouldDedup = async (args: {
      appointmentId: Id<"appointments">;
      reminderType: "24h" | "1h";
      status: ReminderAttemptStatus;
      reasonCode: ReminderAttemptReasonCode;
      nowISO: string;
      dedupMinutes: number;
    }): Promise<boolean> => {
      const latest = await ctx.runQuery(internal.reminders.getLatestReminderAttempt, {
        appointmentId: args.appointmentId,
        reminderType: args.reminderType,
      });
      if (!latest) return false;
      if (latest.status !== args.status || latest.reasonCode !== args.reasonCode) return false;
      const last = new Date(latest.attemptedAt).getTime();
      const nowMs = new Date(args.nowISO).getTime();
      if (!isFinite(last) || !isFinite(nowMs)) return false;
      const minutes = (nowMs - last) / (1000 * 60);
      return minutes >= 0 && minutes < args.dedupMinutes;
    };

    const recordAttempt = async (args: {
      appointmentId: Id<"appointments">;
      patientId: Id<"patients">;
      reminderType: "24h" | "1h";
      targetDate: string;
      teamId: Id<"teams">;
      status: ReminderAttemptStatus;
      reasonCode: ReminderAttemptReasonCode;
      details: Record<string, unknown>;
      dedupMinutes?: number;
      noteOverride?: string;
    }) => {
      const dedupMinutes = args.dedupMinutes ?? 30;
      const skip = await shouldDedup({
        appointmentId: args.appointmentId,
        reminderType: args.reminderType,
        status: args.status,
        reasonCode: args.reasonCode,
        nowISO,
        dedupMinutes,
      });
      if (skip) return;
      await ctx.runMutation(internal.reminders.recordReminderAttempt, {
        appointmentId: args.appointmentId,
        patientId: args.patientId,
        reminderType: args.reminderType,
        targetDate: args.targetDate,
        attemptedAt: nowISO,
        status: args.status,
        reasonCode: args.reasonCode,
        note: args.noteOverride ?? noteFor(args.status, args.reasonCode),
        detailsJson: JSON.stringify(args.details),
        teamId: args.teamId,
      });
    };

    // Process each appointment
    const teamCache = new Map<string, any>();
    for (const appointment of allAppointments) {
      try {
        const appointmentDate = new Date(appointment.dateTime);
        const hoursUntil = hoursUntilAppointment(appointmentDate, now);

        // Load team settings (timezone/address) for consistent formatting and quiet hours.
        const teamIdStr = String(appointment.teamId);
        let team = teamCache.get(teamIdStr);
        if (!team) {
          team = await ctx.runQuery(internal.reminders.getTeamById, {
            teamId: appointment.teamId,
          });
          teamCache.set(teamIdStr, team);
        }
        const timezone: string = team?.timezone || DEFAULT_TIMEZONE;
        const hospitalAddress: string = team?.hospitalAddress || DEFAULT_HOSPITAL_ADDRESS;

        const currentHour = getCurrentHourInTimezone(timezone);
        const inQuietHours = quietHoursValid ? isInQuietHours(currentHour, quietStart, quietEnd) : false;

        // Check if appointment needs 24h reminder
        if (isWithinWindow("24h", hoursUntil)) {
          // Check if 24h reminder already sent (includes bookings within the 24h window)
          const existingReminder = await ctx.runQuery(
            internal.reminders.getReminderSentRecord,
            {
              appointmentId: appointment._id,
              reminderType: "24h",
            }
          );

          if (existingReminder) {
            const source = (existingReminder as any).source ?? null;
            const sentAt = (existingReminder as any).sentAt as string | undefined;
            const sentAtHoursBefore =
              sentAt && appointment.dateTime
                ? hoursUntilAppointment(new Date(appointment.dateTime), new Date(sentAt))
                : null;
            const sourceInfo = reminderSourceDisplay(source);
            const isBookingConfirmation = sourceInfo.sourceRaw === "booking_confirmation";
            const isAutomatedCheck = sourceInfo.sourceRaw === "automated_check" || sourceInfo.sourceRaw === "cron";

            // Avoid noisy "already sent" rows after a successful send.
            // With minute-level checks, we'll see the appointment again until the window closes.
            // If we've already recorded a "succeeded" attempt for this reminderType, don't add a redundant skip.
            if (isAutomatedCheck) {
              const latestAttempt = await ctx.runQuery(internal.reminders.getLatestReminderAttempt, {
                appointmentId: appointment._id,
                reminderType: "24h",
              });
              if (latestAttempt?.status === "succeeded") {
                continue;
              }
            }

            await recordAttempt({
              appointmentId: appointment._id,
              patientId: appointment.patientId,
              reminderType: "24h",
              targetDate: appointment.dateTime,
              teamId: appointment.teamId,
              status: isBookingConfirmation ? "skipped_booking_confirmation" : "skipped_already_sent",
              reasonCode: isBookingConfirmation ? "BOOKING_CONFIRMATION" : "ALREADY_SENT",
              noteOverride: isBookingConfirmation
                ? `Skipped 24h reminder because booking confirmation SMS was sent ${sentAtHoursBefore !== null ? `~${formatHoursHuman(sentAtHoursBefore)} ` : ""}before the appointment (avoid duplicate).`
                : `Skipped 24h reminder because it was already sent earlier${sentAt ? ` at ${sentAt}` : ""}.`,
              details: {
                nowISO,
                appointmentDateTime: appointment.dateTime,
                hoursUntil,
                existingReminder: {
                  _id: existingReminder._id,
                  sentAt,
                  source: sourceInfo.sourceDisplay,
                  sourceRaw: sourceInfo.sourceRaw,
                  targetDate: (existingReminder as any).targetDate,
                  sentAtHoursBeforeAppointment: sentAtHoursBefore,
                },
              },
              dedupMinutes: 240,
            });
          } else {
            // Get patient details
            const patient = await ctx.runQuery(internal.reminders.getPatientById, {
              patientId: appointment.patientId,
            });

            if (patient) {
              if (!quietHoursValid) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "24h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "failed_precondition",
                  reasonCode: "INVALID_QUIET_HOURS",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil, quietStart, quietEnd, currentHour, timezone },
                  dedupMinutes: 60,
                });
              } else if (inQuietHours) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "24h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "skipped_quiet_hours",
                  reasonCode: "QUIET_HOURS",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil, quietStart, quietEnd, currentHour, timezone },
                  dedupMinutes: 60,
                });
              } else if (!BASE_URL) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "24h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "failed_precondition",
                  reasonCode: "BASE_URL_NOT_CONFIGURED",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil },
                  dedupMinutes: 240,
                });
              } else {
                console.log(`Sending 24h reminder for appointment ${appointment._id}`);
                const result = await sendReminder24hWebhook(
                  appointment._id,
                  patient.name || null,
                  patient.phone,
                  appointmentDate,
                  timezone,
                  hospitalAddress
                );

                if (result.ok) {
                  await ctx.runMutation(internal.reminders.recordReminderSent, {
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "24h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                  });
                  await recordAttempt({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "24h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                    status: "succeeded",
                    reasonCode: "SENT",
                    details: {
                      nowISO,
                      appointmentDateTime: appointment.dateTime,
                      hoursUntil,
                      webhook: result,
                    },
                    dedupMinutes: 5,
                  });
                } else {
                  const reason = result.errorMessage === "BASE_URL_NOT_CONFIGURED" ? "BASE_URL_NOT_CONFIGURED" : mapWebhookFailureToReason(result);
                  const status: ReminderAttemptStatus =
                    reason === "BASE_URL_NOT_CONFIGURED" ? "failed_precondition" : "failed_webhook";
                  await recordAttempt({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "24h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                    status,
                    reasonCode: reason,
                    details: {
                      nowISO,
                      appointmentDateTime: appointment.dateTime,
                      hoursUntil,
                      webhook: result,
                    },
                    dedupMinutes: 30,
                  });
                }
              }
            } else {
              await recordAttempt({
                appointmentId: appointment._id,
                patientId: appointment.patientId,
                reminderType: "24h",
                targetDate: appointment.dateTime,
                teamId: appointment.teamId,
                status: "failed_precondition",
                reasonCode: "PATIENT_NOT_FOUND",
                details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil },
                dedupMinutes: 240,
              });
            }
          }
        }

        // Check if appointment needs 1h reminder
        if (isWithinWindow("1h", hoursUntil)) {
          // Check if 1h reminder already sent
          const existingReminder = await ctx.runQuery(
            internal.reminders.getReminderSentRecord,
            {
              appointmentId: appointment._id,
              reminderType: "1h",
            }
          );

          if (existingReminder) {
            const source = (existingReminder as any).source ?? null;
            const sentAt = (existingReminder as any).sentAt as string | undefined;
            const sentAtHoursBefore =
              sentAt && appointment.dateTime
                ? hoursUntilAppointment(new Date(appointment.dateTime), new Date(sentAt))
                : null;
            const sourceInfo = reminderSourceDisplay(source);
            const isBookingConfirmation = sourceInfo.sourceRaw === "booking_confirmation";
            const isAutomatedCheck = sourceInfo.sourceRaw === "automated_check" || sourceInfo.sourceRaw === "cron";

            // Avoid noisy "already sent" rows after a successful send.
            if (isAutomatedCheck) {
              const latestAttempt = await ctx.runQuery(internal.reminders.getLatestReminderAttempt, {
                appointmentId: appointment._id,
                reminderType: "1h",
              });
              if (latestAttempt?.status === "succeeded") {
                continue;
              }
            }

            await recordAttempt({
              appointmentId: appointment._id,
              patientId: appointment.patientId,
              reminderType: "1h",
              targetDate: appointment.dateTime,
              teamId: appointment.teamId,
              status: isBookingConfirmation ? "skipped_booking_confirmation" : "skipped_already_sent",
              reasonCode: isBookingConfirmation ? "BOOKING_CONFIRMATION" : "ALREADY_SENT",
              noteOverride: isBookingConfirmation
                ? `Skipped 1h reminder because booking confirmation SMS was sent ${sentAtHoursBefore !== null ? `~${formatHoursHuman(sentAtHoursBefore)} ` : ""}before the appointment (avoid duplicate).`
                : `Skipped 1h reminder because it was already sent earlier${sentAt ? ` at ${sentAt}` : ""}.`,
              details: {
                nowISO,
                appointmentDateTime: appointment.dateTime,
                hoursUntil,
                existingReminder: {
                  _id: existingReminder._id,
                  sentAt,
                  source: sourceInfo.sourceDisplay,
                  sourceRaw: sourceInfo.sourceRaw,
                  targetDate: (existingReminder as any).targetDate,
                  sentAtHoursBeforeAppointment: sentAtHoursBefore,
                },
              },
              dedupMinutes: 120,
            });
          } else {
            // Get patient details
            const patient = await ctx.runQuery(internal.reminders.getPatientById, {
              patientId: appointment.patientId,
            });

            if (patient) {
              if (!quietHoursValid) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "1h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "failed_precondition",
                  reasonCode: "INVALID_QUIET_HOURS",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil, quietStart, quietEnd, currentHour, timezone },
                  dedupMinutes: 30,
                });
              } else if (inQuietHours) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "1h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "skipped_quiet_hours",
                  reasonCode: "QUIET_HOURS",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil, quietStart, quietEnd, currentHour, timezone },
                  dedupMinutes: 30,
                });
              } else if (!BASE_URL) {
                await recordAttempt({
                  appointmentId: appointment._id,
                  patientId: appointment.patientId,
                  reminderType: "1h",
                  targetDate: appointment.dateTime,
                  teamId: appointment.teamId,
                  status: "failed_precondition",
                  reasonCode: "BASE_URL_NOT_CONFIGURED",
                  details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil },
                  dedupMinutes: 120,
                });
              } else {
                console.log(`Sending 1h reminder for appointment ${appointment._id}`);
                const result = await sendReminder1hWebhook(
                  appointment._id,
                  patient.name || null,
                  patient.phone,
                  appointmentDate,
                  timezone,
                  hospitalAddress
                );

                if (result.ok) {
                  await ctx.runMutation(internal.reminders.recordReminderSent, {
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "1h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                  });
                  await recordAttempt({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "1h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                    status: "succeeded",
                    reasonCode: "SENT",
                    details: {
                      nowISO,
                      appointmentDateTime: appointment.dateTime,
                      hoursUntil,
                      webhook: result,
                    },
                    dedupMinutes: 5,
                  });
                } else {
                  const reason = result.errorMessage === "BASE_URL_NOT_CONFIGURED" ? "BASE_URL_NOT_CONFIGURED" : mapWebhookFailureToReason(result);
                  const status: ReminderAttemptStatus =
                    reason === "BASE_URL_NOT_CONFIGURED" ? "failed_precondition" : "failed_webhook";
                  await recordAttempt({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    reminderType: "1h",
                    targetDate: appointment.dateTime,
                    teamId: appointment.teamId,
                    status,
                    reasonCode: reason,
                    details: {
                      nowISO,
                      appointmentDateTime: appointment.dateTime,
                      hoursUntil,
                      webhook: result,
                    },
                    dedupMinutes: 15,
                  });
                }
              }
            } else {
              await recordAttempt({
                appointmentId: appointment._id,
                patientId: appointment.patientId,
                reminderType: "1h",
                targetDate: appointment.dateTime,
                teamId: appointment.teamId,
                status: "failed_precondition",
                reasonCode: "PATIENT_NOT_FOUND",
                details: { nowISO, appointmentDateTime: appointment.dateTime, hoursUntil },
                dedupMinutes: 120,
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing appointment ${appointment._id}:`, error);
        // Record a durable processing failure so we can explain "why not sent"
        try {
          await ctx.runMutation(internal.reminders.recordReminderAttempt, {
            appointmentId: appointment._id,
            patientId: appointment.patientId,
            reminderType: "24h", // best-effort; actual type depends on window
            targetDate: appointment.dateTime,
            attemptedAt: nowISO,
            status: "failed_processing",
            reasonCode: "UNKNOWN_ERROR",
            note: "Reminder not sent due to an internal processing error.",
            detailsJson: JSON.stringify({
              nowISO,
              appointmentDateTime: appointment.dateTime,
              error: error instanceof Error ? error.message : String(error),
            }),
            teamId: appointment.teamId,
          });
        } catch {
          // If logging fails, still continue with next appointment
        }
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
      
      // Quiet hours are enforced as 10pm–5am in the team's timezone (per appointment).
      // We do not skip the whole run; we evaluate quiet hours per appointment like production.
      const quietStartStr = process.env.SMS_QUIET_HOURS_START;
      const quietEndStr = process.env.SMS_QUIET_HOURS_END;
      console.log(
        `TEST: Quiet hours env provided: ${quietStartStr || "unset"}-${quietEndStr || "unset"} (enforced=22-5, per-team timezone)`
      );

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
      const teamCache = new Map<string, any>();
      for (const appointment of allAppointments) {
        try {
          const appointmentDate = new Date(appointment.dateTime);
          const hoursUntil = hoursUntilAppointment(appointmentDate, now);
          const teamIdStr = String(appointment.teamId);
          let team = teamCache.get(teamIdStr);
          if (!team) {
            team = await ctx.runQuery(internal.reminders.getTeamById, {
              teamId: appointment.teamId,
            });
            teamCache.set(teamIdStr, team);
          }
          const timezone: string = team?.timezone || DEFAULT_TIMEZONE;
          const hospitalAddress: string = team?.hospitalAddress || DEFAULT_HOSPITAL_ADDRESS;

          const currentHour = getCurrentHourInTimezone(timezone);
          const inQuietHours = isInQuietHours(currentHour, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END);
          
          console.log(
            `TEST: Processing appointment ${appointment._id} - ${hoursUntil.toFixed(
              2
            )}h until appointment (timezone=${timezone} currentHour=${currentHour} inQuiet=${inQuietHours})`
          );

          // Check if appointment needs 24h reminder
          if (isWithinWindow("24h", hoursUntil)) {
            console.log(`TEST: ⏰ Appointment ${appointment._id} is in 24h reminder window`);
            
            // Check if 24h reminder already sent (includes bookings within the 24h window)
            const existingReminder = await ctx.runQuery(
              internal.reminders.getReminderSentRecord,
              {
                appointmentId: appointment._id,
                reminderType: "24h",
              }
            );

            if (!existingReminder) {
              if (inQuietHours) {
                console.log(
                  `TEST: ⏭️ Skipping send due to quiet hours (22-5) in team timezone (${timezone})`
                );
              } else {
              // Get patient details
              const patient = await ctx.runQuery(internal.reminders.getPatientById, {
                patientId: appointment.patientId,
              });

              if (patient) {
                console.log(`TEST: 📤 Sending 24h reminder for appointment ${appointment._id} to ${patient.phone}`);
                const result = await sendReminder24hWebhook(
                  appointment._id,
                  patient.name || null,
                  patient.phone,
                  appointmentDate,
                  timezone,
                  hospitalAddress
                );

                // Only record reminder if it was sent successfully
                if (result.ok) {
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
              internal.reminders.getReminderSentRecord,
              {
                appointmentId: appointment._id,
                reminderType: "1h",
              }
            );

            if (!existingReminder) {
              if (inQuietHours) {
                console.log(
                  `TEST: ⏭️ Skipping send due to quiet hours (22-5) in team timezone (${timezone})`
                );
              } else {
              // Get patient details
              const patient = await ctx.runQuery(internal.reminders.getPatientById, {
                patientId: appointment.patientId,
              });

              if (patient) {
                console.log(`TEST: 📤 Sending 1h reminder for appointment ${appointment._id} to ${patient.phone}`);
                const result = await sendReminder1hWebhook(
                  appointment._id,
                  patient.name || null,
                  patient.phone,
                  appointmentDate,
                  timezone,
                  hospitalAddress
                );

                // Only record reminder if it was sent successfully
                if (result.ok) {
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
      .filter((q) => q.neq(q.field("status"), "cancelled"))
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
      // Cancelled appointments should not receive reminders.
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .collect();
    return appts;
  },
});

/**
 * PUBLIC Mutation: Record an SMS send attempt tied to an appointment.
 *
 * Used by the Next.js API to log booking confirmation + cancellation SMS sends
 * so the admin UI can show a complete message history for an appointment.
 */
export const recordAppointmentSmsAttempt = mutation({
  args: {
    userEmail: v.string(),
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    messageType: v.string(), // "booking_confirmation" | "cancellation" | etc.
    targetDate: v.string(), // appointment dateTime ISO
    webhookResult: v.object({
      ok: v.boolean(),
      attemptCount: v.number(),
      httpStatus: v.union(v.number(), v.null()),
      failureReason: v.union(v.string(), v.null()),
      errorMessage: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    // Enforce multi-tenancy via userEmail -> teamId.
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    if (!user) throw new Error("User not found in database.");

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment || appointment.teamId !== user.teamId) {
      throw new Error("Appointment not found.");
    }

    // Optional safety: ensure the patient matches the appointment.
    if (appointment.patientId !== args.patientId) {
      throw new Error("Patient does not match appointment.");
    }

    const nowISO = new Date().toISOString();
    const status: ReminderAttemptStatus = args.webhookResult.ok ? "succeeded" : "failed_webhook";
    const reasonCode: ReminderAttemptReasonCode = args.webhookResult.ok
      ? "SENT"
      : mapWebhookFailureToReason(args.webhookResult as unknown as SMSWebhookResult);

    const messageLabel =
      args.messageType === "booking_confirmation"
        ? "Booking confirmation SMS"
        : args.messageType === "cancellation"
          ? "Cancellation SMS"
          : "SMS message";

    const note = args.webhookResult.ok
      ? `${messageLabel} sent successfully. It may take 1–3 minutes to arrive on the patient's phone.`
      : `${messageLabel} not sent due to SMS webhook failure.`;

    await ctx.db.insert("reminderAttempts", {
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      reminderType: args.messageType,
      targetDate: args.targetDate,
      attemptedAt: nowISO,
      status,
      reasonCode,
      note,
      detailsJson: JSON.stringify({
        webhookResult: args.webhookResult,
        appointmentDateTime: args.targetDate,
      }),
      teamId: appointment.teamId,
    });
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
 * Query: Get the reminder record (if any) for appointment + type.
 * Use this when you need to explain *why* a reminder was considered already sent.
 */
export const getReminderSentRecord = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
    reminderType: v.union(v.literal("24h"), v.literal("1h")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reminders")
      .withIndex("by_appointment_type", (q) =>
        q.eq("appointmentId", args.appointmentId).eq("reminderType", args.reminderType)
      )
      .first();
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
 * Query: Get team by ID (used by reminder actions for timezone/address).
 */
export const getTeamById = internalQuery({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});

/**
 * Query: Get the latest reminder attempt for an appointment + reminderType.
 * Used for deduping noisy statuses (quiet hours, webhook failures).
 */
export const getLatestReminderAttempt = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
    reminderType: v.union(v.literal("24h"), v.literal("1h")),
  },
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query("reminderAttempts")
      .withIndex("by_appointment_type", (q) =>
        q.eq("appointmentId", args.appointmentId).eq("reminderType", args.reminderType)
      )
      .order("desc")
      .take(1);
    return attempts[0] ?? null;
  },
});

/**
 * Mutation: Record reminder attempt outcome (durable audit trail).
 */
export const recordReminderAttempt = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    reminderType: v.union(v.literal("24h"), v.literal("1h")),
    targetDate: v.string(),
    attemptedAt: v.string(),
    status: v.string(),
    reasonCode: v.string(),
    note: v.string(),
    detailsJson: v.optional(v.string()),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reminderAttempts", {
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      reminderType: args.reminderType,
      targetDate: args.targetDate,
      attemptedAt: args.attemptedAt,
      status: args.status,
      reasonCode: args.reasonCode,
      note: args.note,
      detailsJson: args.detailsJson,
      teamId: args.teamId,
    });
  },
});

/**
 * Query: Get reminder attempts for a given appointment (team-scoped).
 * Intended for in-app debugging / CEO reporting.
 */
export const getReminderAttemptsByAppointment = internalQuery({
  args: {
    teamId: v.id("teams"),
    appointmentId: v.id("appointments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const attempts = await ctx.db
      .query("reminderAttempts")
      .withIndex("by_team_appointment", (q) =>
        q.eq("teamId", args.teamId).eq("appointmentId", args.appointmentId)
      )
      .order("desc")
      .take(limit);
    return attempts;
  },
});

/**
 * Public query: Get reminder attempts for a specific appointment (team-scoped via userEmail).
 * This is intended to power the authenticated dashboard so you can explain "why it didn't send."
 */
export const getReminderAttemptsForAppointment = query({
  args: {
    userEmail: v.string(),
    appointmentId: v.id("appointments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    if (!user) throw new Error("User not found in database");

    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment || appointment.teamId !== user.teamId) {
      // Hide existence across teams
      throw new Error("Appointment not found");
    }

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const attempts = await ctx.db
      .query("reminderAttempts")
      .withIndex("by_team_appointment", (q) =>
        q.eq("teamId", user.teamId).eq("appointmentId", args.appointmentId)
      )
      .order("desc")
      .take(limit);
    return attempts;
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
      source: "automated_check",
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
 * `getReminderSentRecord` returns a record and skips the reminder.
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

    const marked: { marked24h: boolean; marked1h: boolean } = {
      marked24h: false,
      marked1h: false,
    };

    const maybeInsertSuppression = async (reminderType: "24h" | "1h") => {
      const existing = await ctx.db
        .query("reminders")
        .withIndex("by_appointment_type", (q) =>
          q.eq("appointmentId", args.appointmentId).eq("reminderType", reminderType)
        )
        .first();
      if (existing) return false;

      await ctx.db.insert("reminders", {
        appointmentId: args.appointmentId,
        patientId: args.patientId,
        reminderType,
        targetDate: args.appointmentDateTime,
        sentAt: now.toISOString(),
        source: "booking_confirmation",
        teamId: args.teamId,
      });

      // Also record an audit trail entry immediately so admins don't have to wait for cron.
      await ctx.db.insert("reminderAttempts", {
        appointmentId: args.appointmentId,
        patientId: args.patientId,
        reminderType,
        targetDate: args.appointmentDateTime,
        attemptedAt: now.toISOString(),
        status: "skipped_booking_confirmation",
        reasonCode: "BOOKING_CONFIRMATION",
        note:
          reminderType === "24h"
            ? `Skipped 24h reminder because booking confirmation SMS was sent at booking time (~${hoursUntil.toFixed(
                2
              )}h before appointment).`
            : `Skipped 1h reminder because booking confirmation SMS was sent at booking time (~${hoursUntil.toFixed(
                2
              )}h before appointment).`,
        detailsJson: JSON.stringify({
          bookedAt: now.toISOString(),
          appointmentDateTime: args.appointmentDateTime,
          hoursUntilAtBooking: hoursUntil,
          suppressionWindowHours:
            reminderType === "24h"
              ? [BOOKING_SUPPRESS_24H_START, BOOKING_SUPPRESS_24H_END]
              : [BOOKING_SUPPRESS_1H_START, BOOKING_SUPPRESS_1H_END],
        }),
        teamId: args.teamId,
      });

      return true;
    };

    // Only suppress the 24h reminder if booking confirmation was sent within 24h–24h45m.
    if (hoursUntil >= BOOKING_SUPPRESS_24H_START && hoursUntil < BOOKING_SUPPRESS_24H_END) {
      marked.marked24h = await maybeInsertSuppression("24h");
      if (marked.marked24h) {
        console.log(
          `Suppressed 24h reminder for appointment ${args.appointmentId} (booking confirmation at ${hoursUntil.toFixed(
            2
          )}h before appointment)`
        );
      }
    }

    // Only suppress the 1h reminder if booking confirmation was sent within 1h–1h45m.
    if (hoursUntil >= BOOKING_SUPPRESS_1H_START && hoursUntil < BOOKING_SUPPRESS_1H_END) {
      marked.marked1h = await maybeInsertSuppression("1h");
      if (marked.marked1h) {
        console.log(
          `Suppressed 1h reminder for appointment ${args.appointmentId} (booking confirmation at ${hoursUntil.toFixed(
            2
          )}h before appointment)`
        );
      }
    }

    return marked;
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
        status: "scheduled",
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

