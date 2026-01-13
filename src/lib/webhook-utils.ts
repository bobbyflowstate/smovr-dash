import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { APPOINTMENT_TIMEZONE } from '@/lib/timezone-utils';
import {
  sendSMSWebhook,
  formatScheduleMessage,
  formatCancelMessage,
} from '../../convex/webhook_utils';

const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';

/**
 * Sends a webhook when a new appointment is scheduled
 */
export async function sendScheduleWebhook(
  convex: ConvexHttpClient,
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  phone: string,
  name: string | null
): Promise<boolean> {
  try {
    // Get appointment and patient details
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment) {
      console.error('Appointment not found for webhook:', appointmentId);
      return false;
    }

    const patient = await convex.query(api.patients.getById, {
      patientId,
    });

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
      APPOINTMENT_TIMEZONE,
      HOSPITAL_ADDRESS
    );
    
    // Send SMS webhook
    return await sendSMSWebhook(phone, message);
  } catch (error) {
    console.error('Error preparing schedule webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment creation
    return false;
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
): Promise<void> {
  try {
    // Parse appointment date/time
    const appointmentDate = new Date(appointmentDateTime);
    
    // Get patient name - use null if not found (not "Unknown")
    const patientName = name || null;
    
    // Format message using shared formatter
    const message = formatCancelMessage(patientName, appointmentDate, APPOINTMENT_TIMEZONE, HOSPITAL_ADDRESS);
    
    // Send SMS webhook
    await sendSMSWebhook(phone, message);
  } catch (error) {
    console.error('Error preparing cancel webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment cancellation
  }
}
