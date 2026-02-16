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
import {
  createProviderFromConfig,
  getDefaultProvider,
  type TeamSmsConfig,
} from "./sms_factory";
import type { SendResult } from "./sms_provider";

export type SMSWebhookFailureReason =
  | "WEBHOOK_URL_NOT_CONFIGURED"
  | "HTTP_NON_RETRYABLE"
  | "HTTP_RETRY_EXHAUSTED"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export type SMSWebhookResult = {
  ok: boolean;
  attemptCount: number;
  httpStatus: number | null;
  failureReason: SMSWebhookFailureReason | null;
  errorMessage: string | null;
};

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

function getTimezoneLabelShort(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timezone;
  } catch {
    return timezone;
  }
}

/** Convert a provider SendResult to the legacy SMSWebhookResult */
function toWebhookResult(r: SendResult): SMSWebhookResult {
  if (r.success) {
    return {
      ok: true,
      attemptCount: r.attemptCount,
      httpStatus: r.httpStatus ?? null,
      failureReason: null,
      errorMessage: null,
    };
  }
  const failMap: Record<string, SMSWebhookFailureReason> = {
    HTTP_ERROR: "HTTP_NON_RETRYABLE",
    TIMEOUT: "TIMEOUT",
    RATE_LIMITED: "HTTP_RETRY_EXHAUSTED",
  };
  return {
    ok: false,
    attemptCount: r.attemptCount,
    httpStatus: r.httpStatus ?? null,
    failureReason: failMap[r.failureReason ?? ""] ?? "NETWORK_ERROR",
    errorMessage: r.error ?? null,
  };
}

/**
 * Send an SMS through the pluggable provider system.
 *
 * Backwards-compatible: if no `teamConfig` is supplied the provider is
 * resolved from environment variables (Twilio -> GHL -> Mock), which is
 * the same behaviour as the previous GHL-only implementation.
 */
export async function sendSMSWebhookDetailed(
  phone: string,
  message: string,
  teamConfig?: TeamSmsConfig | null,
): Promise<SMSWebhookResult> {
  const provider = teamConfig
    ? createProviderFromConfig(teamConfig) ?? getDefaultProvider()
    : getDefaultProvider();

  const result = await provider.sendMessage({ to: phone, body: message });
  return toWebhookResult(result);
}

/**
 * Convenience wrapper that returns a simple boolean.
 */
export async function sendSMSWebhook(
  phone: string,
  message: string,
  teamConfig?: TeamSmsConfig | null,
): Promise<boolean> {
  const result = await sendSMSWebhookDetailed(phone, message, teamConfig);
  return result.ok;
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
  const tzLabel = getTimezoneLabelShort(timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = `${baseUrl}/reschedule-cancel/${appointmentId}`;
  
  const greetingEn = patientName ? `Hi ${patientName}, your appointment is confirmed.` : 'Your appointment is confirmed.';
  const greetingEs = patientName ? `Hola ${patientName}, su cita está confirmada.` : 'Su cita está confirmada.';
  
  return `${greetingEn}\n${greetingEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
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
  const tzLabel = getTimezoneLabelShort(timezone);
  
  const msgEn = patientName 
    ? `Hi ${patientName}, your appointment has been canceled.`
    : 'Your appointment has been canceled.';
  const msgEs = patientName
    ? `Hola ${patientName}, su cita ha sido cancelada.`
    : 'Su cita ha sido cancelada.';
  
  return `${msgEn}\n${msgEs}\n\n` +
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
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
  const tzLabel = getTimezoneLabelShort(timezone);
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
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
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
  const tzLabel = getTimezoneLabelShort(timezone);
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
    `Date & Time / Fecha y hora:\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
    `Address / Dirección:\n${hospitalAddress}\n\n` +
    `Let us know if you are / Infórmenos si usted:\n\n` +
    `• 15 mins late / 15 minutos tarde:\n${url15}\n\n` +
    `• 30 mins late / 30 minutos tarde:\n${url30}\n\n` +
    `• Need to reschedule / Necesita reprogramar:\n${urlReschedule}`;
}

