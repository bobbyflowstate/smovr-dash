/**
 * Shared webhook utility functions
 * 
 * This is the source of truth for all webhook-related utilities.
 * Both Convex functions and Next.js import from this file.
 * 
 * Note: Convex functions can only import from convex/, so shared code
 * must live here. Next.js can import from anywhere.
 */

import { Id } from "./_generated/dataModel";

// Webhook timeout constant (in milliseconds)
const WEBHOOK_TIMEOUT_MS = 10000; // 10 seconds

interface SMSWebhookPayload {
  phone: string;
  message: string;
}

/**
 * Formats appointment date/time for webhook payload
 * 
 * @param appointmentDate The appointment date as a Date object
 * @param timezone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns Object with formatted date strings for webhook payload
 */
export function formatAppointmentDateTime(appointmentDate: Date, timezone: string): {
  appointmentDateStr: string;
  appointmentTimeStr: string;
  appointmentDateTimeStr: string;
} {
  // Format date prettier: "January 15, 2024"
  const appointmentDateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(appointmentDate);
  
  // Format time in timezone: "2:30 PM" (hours and minutes only)
  const appointmentTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(appointmentDate);

  // Format datetime in timezone: "12-21-2021 08:30 AM" (MM-DD-YYYY HH:MM A)
  const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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
 * Unified webhook function that sends SMS message to GoHighLevel
 * @returns true if webhook was sent successfully, false otherwise
 */
export async function sendSMSWebhook(phone: string, message: string): Promise<boolean> {
  const webhookUrl = process.env.GHL_SMS_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('GHL_SMS_WEBHOOK_URL not configured, skipping SMS webhook');
    return false;
  }

  // Create abort controller for webhook timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const payload: SMSWebhookPayload = { phone, message };
    console.log('Sending SMS webhook to:', webhookUrl);
    console.log('SMS webhook payload:', payload);

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
      console.log('SMS webhook sent successfully');
      return true;
    } else {
      console.error('SMS webhook failed with status:', webhookResponse.status);
      return false;
    }
  } catch (webhookError) {
    clearTimeout(timeoutId);
    if (webhookError instanceof Error && webhookError.name === 'AbortError') {
      console.error(`SMS webhook request timed out after ${WEBHOOK_TIMEOUT_MS / 1000} seconds`);
    } else {
      console.error('Error sending SMS webhook:', webhookError);
    }
    return false;
  }
}

/**
 * Formats schedule confirmation message (bilingual English/Spanish)
 */
export function formatScheduleMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  const greetingEn = patientName ? `Hi ${patientName}, your appointment is confirmed.` : 'Your appointment is confirmed.';
  const greetingEs = patientName ? `Hola ${patientName}, su cita está confirmada.` : 'Su cita está confirmada.';
  
  return `${greetingEn}\n${greetingEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr}\n\n` +
    `Address / Dirección:\n${hospitalAddress}\n\n` +
    `Let us know if you are / Infórmenos si usted:\n\n` +
    `• 15 mins late / 15 minutos tarde:\n${url15}\n\n` +
    `• 30 mins late / 30 minutos tarde:\n${url30}\n\n` +
    `• Need to reschedule / Necesita reprogramar:\n${urlReschedule}`;
}

/**
 * Formats cancellation notification message (bilingual English/Spanish)
 */
export function formatCancelMessage(
  patientName: string | null,
  appointmentDate: Date,
  timezone: string,
  hospitalAddress: string
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  
  const msgEn = patientName 
    ? `Hi ${patientName}, your appointment has been canceled.`
    : 'Your appointment has been canceled.';
  const msgEs = patientName
    ? `Hola ${patientName}, su cita ha sido cancelada.`
    : 'Su cita ha sido cancelada.';
  
  return `${msgEn}\n${msgEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr}\n\n` +
    `Address / Dirección:\n${hospitalAddress}\n\n` +
    `If you need to reschedule, please contact us.\n` +
    `Si necesita reprogramar, por favor contáctenos.`;
}

/**
 * Gets the relative day label for an appointment date compared to now
 * Returns "today", "tomorrow", or null (use full date instead)
 */
function getRelativeDayLabel(appointmentDate: Date, timezone: string): 'today' | 'tomorrow' | null {
  const now = new Date();
  
  // Get today's date in the timezone (YYYY-MM-DD format for comparison)
  const todayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const todayStr = todayFormatter.format(now);
  const appointmentStr = todayFormatter.format(appointmentDate);
  
  if (appointmentStr === todayStr) {
    return 'today';
  }
  
  // Check if appointment is tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = todayFormatter.format(tomorrow);
  
  if (appointmentStr === tomorrowStr) {
    return 'tomorrow';
  }
  
  return null;
}

/**
 * Formats 24h reminder message (bilingual English/Spanish)
 */
export function formatReminder24hMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  // Use accurate relative day label based on actual calendar day
  const relativeDay = getRelativeDayLabel(appointmentDate, timezone);
  
  let msgEn: string;
  let msgEs: string;
  
  if (relativeDay === 'tomorrow') {
    msgEn = patientName 
      ? `Hi ${patientName}, just a reminder that your appointment is tomorrow.`
      : 'Just a reminder that your appointment is tomorrow.';
    msgEs = patientName
      ? `Hola ${patientName}, un recordatorio de que su cita es mañana.`
      : 'Un recordatorio de que su cita es mañana.';
  } else if (relativeDay === 'today') {
    msgEn = patientName 
      ? `Hi ${patientName}, just a reminder that your appointment is today.`
      : 'Just a reminder that your appointment is today.';
    msgEs = patientName
      ? `Hola ${patientName}, un recordatorio de que su cita es hoy.`
      : 'Un recordatorio de que su cita es hoy.';
  } else {
    msgEn = patientName 
      ? `Hi ${patientName}, just a reminder about your upcoming appointment.`
      : 'Just a reminder about your upcoming appointment.';
    msgEs = patientName
      ? `Hola ${patientName}, un recordatorio sobre su próxima cita.`
      : 'Un recordatorio sobre su próxima cita.';
  }
  
  return `${msgEn}\n${msgEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr}\n\n` +
    `Address / Dirección:\n${hospitalAddress}\n\n` +
    `Let us know if you are / Infórmenos si usted:\n\n` +
    `• 15 mins late / 15 minutos tarde:\n${url15}\n\n` +
    `• 30 mins late / 30 minutos tarde:\n${url30}\n\n` +
    `• Need to reschedule / Necesita reprogramar:\n${urlReschedule}`;
}

/**
 * Formats 1h reminder message (bilingual English/Spanish)
 */
export function formatReminder1hMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  const msgEn = patientName 
    ? `Hi ${patientName}, just a reminder that your appointment is in about 1 hour.`
    : 'Just a reminder that your appointment is in about 1 hour.';
  const msgEs = patientName
    ? `Hola ${patientName}, un recordatorio rápido de que su cita es en aproximadamente 1 hora.`
    : 'Un recordatorio rápido de que su cita es en aproximadamente 1 hora.';
  
  return `${msgEn}\n${msgEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr}\n\n` +
    `Address / Dirección:\n${hospitalAddress}\n\n` +
    `Let us know if you are / Infórmenos si usted:\n\n` +
    `• 15 mins late / 15 minutos tarde:\n${url15}\n\n` +
    `• 30 mins late / 30 minutos tarde:\n${url30}\n\n` +
    `• Need to reschedule / Necesita reprogramar:\n${urlReschedule}`;
}

