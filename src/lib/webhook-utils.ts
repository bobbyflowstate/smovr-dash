import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  APPOINTMENT_TIMEZONE,
  formatInTimezone,
} from '@/lib/timezone-utils';

const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';

// Webhook timeout constant (in milliseconds)
const WEBHOOK_TIMEOUT_MS = 10000; // 10 seconds

interface WebhookPayload {
  appointment_id: string;
  patient_name: string | null;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  appointment_datetime: string;
  hospital_address: string;
  action?: string;
  response_urls?: {
    "15_min_late": string;
    "30_min_late": string;
    "reschedule_cancel": string;
  };
}

/**
 * Formats appointment date/time for webhook payload
 */
function formatAppointmentDateTime(appointmentDate: Date): {
  appointmentDateStr: string;
  appointmentTimeStr: string;
  appointmentDateTimeStr: string;
} {
  // Format date prettier: "January 15, 2024"
  const appointmentDateStr = formatInTimezone(appointmentDate, APPOINTMENT_TIMEZONE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  // Format time in timezone: "2:30 PM" (hours and minutes only)
  const appointmentTimeStr = formatInTimezone(appointmentDate, APPOINTMENT_TIMEZONE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Format datetime in timezone: "12-21-2021 08:30 AM" (MM-DD-YYYY HH:MM A)
  const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APPOINTMENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  const parts = timezoneFormatter.formatToParts(appointmentDate);
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const ampm = parts.find(p => p.type === 'dayPeriod')?.value || '';
  
  const appointmentDateTimeStr = `${month}-${day}-${year} ${hour}:${minute} ${ampm}`;

  return { appointmentDateStr, appointmentTimeStr, appointmentDateTimeStr };
}

/**
 * Sends a webhook request with timeout and error handling
 */
async function sendWebhookRequest(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<void> {
  // Create abort controller for webhook timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    console.log('Sending webhook to:', webhookUrl);
    console.log('Webhook payload:', payload);

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (webhookResponse.ok) {
      console.log('Webhook sent successfully');
    } else {
      console.error('Webhook failed with status:', webhookResponse.status);
    }
  } catch (webhookError) {
    clearTimeout(timeoutId);
    if (webhookError instanceof Error && webhookError.name === 'AbortError') {
      console.error(`Webhook request timed out after ${WEBHOOK_TIMEOUT_MS / 1000} seconds`);
    } else {
      console.error('Error sending webhook:', webhookError);
    }
    // Don't throw - webhook failures shouldn't fail the operation
  }
}

/**
 * Sends a webhook when a new appointment is scheduled
 */
export async function sendScheduleWebhook(
  convex: ConvexHttpClient,
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  phone: string,
  name: string | null
): Promise<void> {
  const webhookUrl = process.env.SCHEDULE_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('SCHEDULE_WEBHOOK_URL not configured, skipping webhook');
    return;
  }

  try {
    // Get appointment and patient details for webhook payload
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment) {
      console.error('Appointment not found for webhook:', appointmentId);
      return;
    }

    const patient = await convex.query(api.patients.getById, {
      patientId,
    });

    // Parse appointment date/time
    const appointmentDate = new Date(appointment.dateTime);
    const { appointmentDateStr, appointmentTimeStr, appointmentDateTimeStr } = 
      formatAppointmentDateTime(appointmentDate);
    
    // Get patient name - use null if not found (not "Unknown")
    const patientName = patient?.name || name || null;
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const webhookPayload: WebhookPayload = {
      appointment_id: appointmentId,
      patient_name: patientName,
      patient_phone: phone,
      appointment_date: appointmentDateStr,
      appointment_time: appointmentTimeStr,
      appointment_datetime: appointmentDateTimeStr,
      hospital_address: HOSPITAL_ADDRESS,
      response_urls: {
        "15_min_late": `${baseUrl}/15-late/${appointmentId}`,
        "30_min_late": `${baseUrl}/30-late/${appointmentId}`,
        "reschedule_cancel": `${baseUrl}/reschedule-cancel/${appointmentId}`
      }
    };

    await sendWebhookRequest(webhookUrl, webhookPayload);
  } catch (error) {
    console.error('Error preparing schedule webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment creation
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
  // Use CANCEL_WEBHOOK_URL if set, otherwise fall back to SCHEDULE_WEBHOOK_URL
  const webhookUrl = process.env.CANCEL_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('CANCEL_WEBHOOK_URL not configured, skipping cancel webhook');
    return;
  }

  try {
    // Parse appointment date/time
    const appointmentDate = new Date(appointmentDateTime);
    const { appointmentDateStr, appointmentTimeStr, appointmentDateTimeStr } = 
      formatAppointmentDateTime(appointmentDate);
    
    // Get patient name - use null if not found (not "Unknown")
    const patientName = name || null;
    
    const webhookPayload: WebhookPayload = {
      appointment_id: appointmentId,
      patient_name: patientName,
      patient_phone: phone,
      appointment_date: appointmentDateStr,
      appointment_time: appointmentTimeStr,
      appointment_datetime: appointmentDateTimeStr,
      hospital_address: HOSPITAL_ADDRESS,
      action: "canceled"
    };

    await sendWebhookRequest(webhookUrl, webhookPayload);
  } catch (error) {
    console.error('Error preparing cancel webhook:', error);
    // Don't throw - webhook failures shouldn't fail appointment cancellation
  }
}

