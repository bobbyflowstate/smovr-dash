import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  sendSMSWebhookDetailed,
  formatScheduleMessage,
  formatCancelMessage,
  type SMSWebhookResult,
} from '../../convex/webhook_utils';
import { APPOINTMENT_TIMEZONE as FALLBACK_TIMEZONE } from '@/lib/timezone-utils';

const FALLBACK_HOSPITAL_ADDRESS =
  process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';

/**
 * Sends a webhook when a new appointment is scheduled
 */
export async function sendScheduleWebhook(
  convex: ConvexHttpClient,
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  phone: string,
  name: string | null
): Promise<SMSWebhookResult> {
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
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Format message using shared formatter
    const message = formatScheduleMessage(
      patientName,
      appointmentDate,
      appointmentId,
      baseUrl,
      timezone,
      hospitalAddress
    );
    
    // Send SMS webhook
    return await sendSMSWebhookDetailed(phone, message);
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
 */
export async function sendCancelWebhook(
  convex: ConvexHttpClient,
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
    
    // Send SMS webhook
    return await sendSMSWebhookDetailed(phone, message);
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
