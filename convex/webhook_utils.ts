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
 * Formats schedule confirmation message
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
  const name = patientName ? `Hi ${patientName}! ` : '';
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  return `${name}Your appointment is scheduled for ${appointmentDateStr} at ${appointmentTimeStr} at ${hospitalAddress}. ` +
    `If you're running late or need to reschedule, use these links: ` +
    `15 min late: ${url15} | 30 min late: ${url30} | Reschedule/Cancel: ${urlReschedule}`;
}

/**
 * Formats cancellation notification message
 */
export function formatCancelMessage(
  patientName: string | null,
  appointmentDate: Date,
  timezone: string,
  hospitalAddress: string
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const name = patientName ? `Hi ${patientName}, ` : '';
  
  return `${name}your appointment on ${appointmentDateStr} at ${appointmentTimeStr} at ${hospitalAddress} has been canceled. ` +
    `If you need to reschedule, please contact us.`;
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
 * Formats 24h reminder message
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
  const name = patientName ? `Hi ${patientName}, ` : '';
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  // Use accurate relative day label based on actual calendar day
  const relativeDay = getRelativeDayLabel(appointmentDate, timezone);
  const whenStr = relativeDay === 'tomorrow' 
    ? `tomorrow (${appointmentDateStr})` 
    : relativeDay === 'today'
    ? `today (${appointmentDateStr})`
    : `on ${appointmentDateStr}`;
  
  return `${name}reminder: You have an appointment ${whenStr} at ${appointmentTimeStr} at ${hospitalAddress}. ` +
    `If you're running late or need to reschedule, use these links: ` +
    `15 min late: ${url15} | 30 min late: ${url30} | Reschedule/Cancel: ${urlReschedule}`;
}

/**
 * Formats 1h reminder message
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
  const name = patientName ? `Hi ${patientName}, ` : '';
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  // Use accurate relative day label based on actual calendar day
  const relativeDay = getRelativeDayLabel(appointmentDate, timezone);
  const whenStr = relativeDay === 'today' 
    ? `today at ${appointmentTimeStr}` 
    : relativeDay === 'tomorrow'
    ? `tomorrow at ${appointmentTimeStr}`
    : `on ${appointmentDateStr} at ${appointmentTimeStr}`;
  
  return `${name}reminder: You have an appointment ${whenStr} at ${hospitalAddress}. ` +
    `If you're running late or need to reschedule, use these links: ` +
    `15 min late: ${url15} | 30 min late: ${url30} | Reschedule/Cancel: ${urlReschedule}`;
}

