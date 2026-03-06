import { api } from '../../convex/_generated/api';
import { internal } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import type { AdminConvexClient } from '@/lib/convex-server';
import {
  formatScheduleMessage,
  formatCancelMessage,
  formatAppointmentDateTime,
  type SMSWebhookResult,
} from '../../convex/webhook_utils';

// Re-export for use in other parts of the app
export { formatAppointmentDateTime } from '../../convex/webhook_utils';
import { APPOINTMENT_TIMEZONE as FALLBACK_TIMEZONE } from '@/lib/timezone-utils';
import { getSMSProviderForTeam, getDefaultSMSProvider } from '@/lib/sms';
import { getCanonicalAppUrl } from '../../convex/lib/appUrl';

const FALLBACK_HOSPITAL_ADDRESS =
  process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';

/**
 * Send SMS using the team-based provider abstraction, falling back to the
 * default env-based provider when team config is unavailable.
 * Converts SendResult to the legacy SMSWebhookResult format.
 */
async function sendSMSWithProvider(
  convex: AdminConvexClient,
  teamId: Id<"teams"> | null,
  phone: string,
  message: string,
): Promise<SMSWebhookResult> {
  let provider = teamId
    ? await getSMSProviderForTeam(convex, teamId)
    : null;

  if (!provider) {
    provider = getDefaultSMSProvider();
  }

  const result = await provider.sendMessage({ to: phone, body: message });
  
  // Convert to legacy format
  return {
    ok: result.success,
    attemptCount: result.attemptCount,
    httpStatus: result.httpStatus ?? null,
    failureReason: result.success ? null : (result.failureReason === 'HTTP_ERROR' ? 'HTTP_NON_RETRYABLE' : result.failureReason ?? 'NETWORK_ERROR') as any,
    errorMessage: result.error ?? null,
  };
}

/**
 * Sends a webhook when a new appointment is scheduled
 * Also logs the message to the conversation history
 */
export async function sendScheduleWebhook(
  convex: AdminConvexClient,
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  phone: string,
  name: string | null
): Promise<SMSWebhookResult> {
  let message = '';
  let teamId: Id<"teams"> | null = null;
  
  try {
    // Get appointment and patient details
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment) {
      console.error('Appointment not found for webhook:', appointmentId);
      return {
        ok: false,
        attemptCount: 0,
        httpStatus: null,
        failureReason: "NETWORK_ERROR",
        errorMessage: "APPOINTMENT_NOT_FOUND",
      };
    }

    teamId = appointment.teamId;

    const patient = await convex.query(api.patients.getById, {
      patientId,
    });

    const team = await convex.query(api.teams.getById, {
      teamId: appointment.teamId,
    });

    const timezone = team?.timezone || process.env.APPOINTMENT_TIMEZONE || FALLBACK_TIMEZONE;
    const hospitalAddress = team?.hospitalAddress || FALLBACK_HOSPITAL_ADDRESS;

    // Parse appointment date/time
    const appointmentDate = new Date(appointment.dateTime);
    
    // Get patient name - use null if not found (not "Unknown")
    const patientName = patient?.name || name || null;
    
    const baseUrl = getCanonicalAppUrl() || 'http://localhost:3000';
    
    // Format message using shared formatter
    message = formatScheduleMessage(
      patientName,
      appointmentDate,
      appointmentId,
      baseUrl,
      timezone,
      hospitalAddress
    );
    
    // Send SMS using team-based provider abstraction
    const result = await sendSMSWithProvider(convex, teamId, phone, message);
    
    // Log to conversation history
    try {
      await convex.mutation(internal.messages.createSystemMessageInternal, {
        teamId: appointment.teamId,
        patientId,
        appointmentId,
        phone,
        body: message,
        messageType: "booking_confirmation",
        status: result.ok ? "sent" : "failed",
        providerMessageId: undefined, // Not available in legacy format
        errorMessage: result.errorMessage ?? undefined,
      });
    } catch (logError) {
      console.error('Error logging schedule message to conversation:', logError);
      // Don't fail the SMS send if logging fails
    }
    
    return result;
  } catch (error) {
    console.error('Error preparing schedule webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment creation
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
 * Sends a webhook when an appointment is canceled
 * Also logs the message to the conversation history
 */
export async function sendCancelWebhook(
  convex: AdminConvexClient,
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  phone: string,
  name: string | null,
  appointmentDateTime: string
): Promise<SMSWebhookResult> {
  try {
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });
    const team = appointment
      ? await convex.query(api.teams.getById, { teamId: appointment.teamId })
      : null;
    const timezone = team?.timezone || process.env.APPOINTMENT_TIMEZONE || FALLBACK_TIMEZONE;
    const hospitalAddress = team?.hospitalAddress || FALLBACK_HOSPITAL_ADDRESS;

    // Parse appointment date/time
    const appointmentDate = new Date(appointmentDateTime);
    
    // Get patient name - use null if not found (not "Unknown")
    const patientName = name || null;
    
    // Format message using shared formatter
    const message = formatCancelMessage(patientName, appointmentDate, timezone, hospitalAddress);
    
    // Send SMS using team-based provider abstraction
    const teamId = appointment?.teamId ?? null;
    const result = await sendSMSWithProvider(convex, teamId, phone, message);
    
    // Log to conversation history
    if (appointment) {
      try {
        await convex.mutation(internal.messages.createSystemMessageInternal, {
          teamId: appointment.teamId,
          patientId,
          appointmentId,
          phone,
          body: message,
          messageType: "cancellation",
          status: result.ok ? "sent" : "failed",
          providerMessageId: undefined,
          errorMessage: result.errorMessage ?? undefined,
        });
      } catch (logError) {
        console.error('Error logging cancel message to conversation:', logError);
        // Don't fail the SMS send if logging fails
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error preparing cancel webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment cancellation
    return {
      ok: false,
      attemptCount: 0,
      httpStatus: null,
      failureReason: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
