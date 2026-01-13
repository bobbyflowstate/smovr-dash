import type { SMSWebhookResult } from "./webhook_utils";

export type ReminderAttemptStatus =
  | "succeeded"
  | "skipped_quiet_hours"
  | "skipped_booking_confirmation"
  | "skipped_already_sent"
  | "failed_precondition"
  | "failed_webhook"
  | "failed_processing";

export type ReminderAttemptReasonCode =
  | "QUIET_HOURS"
  | "BOOKING_CONFIRMATION"
  | "ALREADY_SENT"
  | "SENT"
  | "INVALID_QUIET_HOURS"
  | "BASE_URL_NOT_CONFIGURED"
  | "PATIENT_NOT_FOUND"
  | "WEBHOOK_URL_NOT_CONFIGURED"
  | "WEBHOOK_HTTP_NON_RETRYABLE"
  | "WEBHOOK_HTTP_RETRY_EXHAUSTED"
  | "WEBHOOK_TIMEOUT"
  | "WEBHOOK_NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export const DEFAULT_QUIET_HOURS_START = 22; // 10pm
export const DEFAULT_QUIET_HOURS_END = 5; // 5am

function hoursFromMinutes(minutes: number): number {
  return minutes / 60;
}

// Booking-confirmation suppression windows (in hours before appointment).
// If the appointment is booked within these windows and the booking confirmation SMS succeeds,
// we suppress the corresponding reminder to avoid double-texting.
//
// Keep the 24h suppression aligned to the 24h reminder send window (23h50m–24h10m).
export const BOOKING_SUPPRESS_24H_START = hoursFromMinutes(23 * 60 + 50); // 23h50m
export const BOOKING_SUPPRESS_24H_END = hoursFromMinutes(24 * 60 + 10); // 24h10m
export const BOOKING_SUPPRESS_1H_START = 1; // 1h
export const BOOKING_SUPPRESS_1H_END = 1.25; // 1h15m

/**
 * Quiet hours helper.
 * For a wrap-around window like 22 -> 5, hours 22..23 and 0..4 are "quiet".
 * `quietEnd` is treated as exclusive.
 */
export function isInQuietHours(currentHour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return true; // 24h quiet (degenerate)
  if (quietStart < quietEnd) {
    return currentHour >= quietStart && currentHour < quietEnd;
  }
  // Wrap-around (e.g., 22 -> 5)
  return currentHour >= quietStart || currentHour < quietEnd;
}

export function mapWebhookFailureToReason(result: SMSWebhookResult): ReminderAttemptReasonCode {
  if (result.ok) return "SENT";
  switch (result.failureReason) {
    case "WEBHOOK_URL_NOT_CONFIGURED":
      return "WEBHOOK_URL_NOT_CONFIGURED";
    case "HTTP_NON_RETRYABLE":
      return "WEBHOOK_HTTP_NON_RETRYABLE";
    case "HTTP_RETRY_EXHAUSTED":
      return "WEBHOOK_HTTP_RETRY_EXHAUSTED";
    case "TIMEOUT":
      return "WEBHOOK_TIMEOUT";
    case "NETWORK_ERROR":
    default:
      return "WEBHOOK_NETWORK_ERROR";
  }
}

export function noteForAttempt(status: ReminderAttemptStatus, reason: ReminderAttemptReasonCode): string {
  // Note: This is used for both reminders and appointment SMS events.
  if (status === "succeeded") {
    return "SMS reminder sent successfully. It may take 1–3 minutes to arrive on the patient's phone.";
  }
  if (status === "skipped_quiet_hours") return "Reminder not sent due to quiet hours.";
  if (status === "skipped_booking_confirmation")
    return "Skipped because booking confirmation SMS already covered this reminder window.";
  if (status === "skipped_already_sent") return "Reminder not sent because it was already recorded as sent.";

  if (status === "failed_precondition") {
    const itNote = " Please contact your IT department.";
    switch (reason) {
      case "INVALID_QUIET_HOURS":
        return `Reminder not sent because quiet hours configuration is invalid.${itNote}`;
      case "BASE_URL_NOT_CONFIGURED":
        return `Reminder not sent because BASE_URL is not configured for Convex.${itNote}`;
      case "PATIENT_NOT_FOUND":
        return `Reminder not sent because patient record was not found.${itNote}`;
      default:
        return `Reminder not sent due to a configuration/precondition failure.${itNote}`;
    }
  }

  if (status === "failed_webhook") {
    switch (reason) {
      case "WEBHOOK_URL_NOT_CONFIGURED":
        return "Reminder not sent because SMS webhook URL is not configured.";
      case "WEBHOOK_HTTP_NON_RETRYABLE":
        return "Reminder not sent because SMS webhook returned a non-retryable HTTP error.";
      case "WEBHOOK_HTTP_RETRY_EXHAUSTED":
        return "Reminder not sent because SMS webhook retries were exhausted.";
      case "WEBHOOK_TIMEOUT":
        return "Reminder not sent because SMS webhook requests timed out.";
      case "WEBHOOK_NETWORK_ERROR":
        return "Reminder not sent due to a network error calling the SMS webhook.";
      default:
        return "Reminder not sent due to SMS webhook failure.";
    }
  }

  return "Reminder not sent due to an unexpected processing error.";
}

