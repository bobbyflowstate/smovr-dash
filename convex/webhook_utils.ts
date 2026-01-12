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
import { logWebhookSuccess, logWebhookFailure, createLogger, LogSource } from "./logger";

// Webhook timeout constant (in milliseconds)
const WEBHOOK_TIMEOUT_MS = 10000; // 10 seconds

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500; // doubles each retry: 500ms, 1s, 2s

/** Sleep helper for backoff delays */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an HTTP status code should trigger a retry */
function isRetryableStatus(status: number): boolean {
  // Retry on server errors (5xx) and rate limiting (429)
  return status >= 500 || status === 429;
}

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
 * Includes automatic retry with exponential backoff for transient failures.
 * 
 * @param phone - Phone number to send SMS to
 * @param message - SMS message content
 * @param source - Log source: "convex" for Convex functions, "vercel" for Next.js API routes
 * @returns true if webhook was sent successfully, false otherwise
 */
export async function sendSMSWebhook(phone: string, message: string, source: LogSource = "convex"): Promise<boolean> {
  const webhookUrl = process.env.GHL_SMS_WEBHOOK_URL;
  const logger = createLogger({ operation: "sendSMSWebhook" }, source);
  
  if (!webhookUrl) {
    logger.warn("GHL_SMS_WEBHOOK_URL not configured, skipping SMS webhook", {
      phone: phone.replace(/(\d{3})(\d{3})(\d{4})/, "***-***-$3"),
    });
    return false;
  }

  const payload: SMSWebhookPayload = { phone, message };
  let lastError: Error | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Apply backoff delay before retries (not on first attempt)
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.debug(`SMS webhook retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms backoff`, {
        attempt,
        maxRetries: MAX_RETRIES,
        backoffMs,
      });
      await sleep(backoffMs);
    }

    // Create abort controller for webhook timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      if (attempt === 0) {
        logger.debug("Sending SMS webhook", {
          webhookUrl,
          messageLength: message.length,
        });
      }

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
        logWebhookSuccess(phone, message, attempt + 1, {
          operation: "sendSMSWebhook",
        }, source);
        return true;
      }

      // Check if we should retry this status code
      lastStatus = webhookResponse.status;
      if (!isRetryableStatus(webhookResponse.status)) {
        // 4xx errors won't succeed on retry - fail immediately
        logWebhookFailure(
          phone,
          `HTTP ${webhookResponse.status}`,
          attempt + 1,
          MAX_RETRIES + 1,
          {
            operation: "sendSMSWebhook",
            statusCode: webhookResponse.status,
            retryable: false,
          },
          source
        );
        return false;
      }

      // Retryable error - log warning but continue
      logWebhookFailure(
        phone,
        `HTTP ${webhookResponse.status}`,
        attempt + 1,
        MAX_RETRIES + 1,
        {
          operation: "sendSMSWebhook",
          statusCode: webhookResponse.status,
          retryable: true,
        },
        source
      );
      // Continue to next retry attempt
    } catch (webhookError) {
      clearTimeout(timeoutId);
      lastError = webhookError instanceof Error ? webhookError : new Error(String(webhookError));

      if (lastError.name === 'AbortError') {
        logWebhookFailure(
          phone,
          new Error(`Request timed out after ${WEBHOOK_TIMEOUT_MS}ms`),
          attempt + 1,
          MAX_RETRIES + 1,
          {
            operation: "sendSMSWebhook",
            timeout: WEBHOOK_TIMEOUT_MS,
          },
          source
        );
      } else {
        logWebhookFailure(
          phone,
          lastError,
          attempt + 1,
          MAX_RETRIES + 1,
          {
            operation: "sendSMSWebhook",
          },
          source
        );
      }
      // Continue to next retry attempt
    }
  }

  // All retries exhausted
  if (lastError) {
    logWebhookFailure(
      phone,
      lastError,
      MAX_RETRIES + 1,
      MAX_RETRIES + 1,
      {
        operation: "sendSMSWebhook",
        finalFailure: true,
      },
      source
    );
  } else if (lastStatus) {
    logWebhookFailure(
      phone,
      `HTTP ${lastStatus}`,
      MAX_RETRIES + 1,
      MAX_RETRIES + 1,
      {
        operation: "sendSMSWebhook",
        statusCode: lastStatus,
        finalFailure: true,
      },
      source
    );
  }
  return false;
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

