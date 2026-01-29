/**
 * SMS Failure Alert System
 *
 * Sends email notifications to admins when outgoing SMS webhooks fail.
 * Uses Resend for email delivery.
 *
 * Required env vars:
 * - RESEND_API_KEY: Resend API key
 * - RESEND_FROM_EMAIL: Verified sender email address
 * - SMS_FAILURE_ALERT_EMAILS: Comma-separated list of admin emails
 */

import { getEmailService } from "./email_service";
import type { SMSFailureContext, SMSWebhookResult, SMSWebhookFailureReason } from "./webhook_utils";

export interface SmsFailureAlertPayload {
  phone: string;
  message: string;
  context?: SMSFailureContext;
  webhookResult: SMSWebhookResult;
}

/**
 * Returns a human-readable label for a failure reason code.
 */
function failureReasonLabel(reason: SMSWebhookFailureReason | null): string {
  switch (reason) {
    case "WEBHOOK_URL_NOT_CONFIGURED":
      return "Webhook URL not configured";
    case "HTTP_NON_RETRYABLE":
      return "HTTP error (non-retryable, e.g. 4xx)";
    case "HTTP_RETRY_EXHAUSTED":
      return "HTTP error (retries exhausted)";
    case "TIMEOUT":
      return "Request timed out";
    case "NETWORK_ERROR":
      return "Network error";
    default:
      return reason ?? "Unknown";
  }
}

/**
 * Builds the plain text email body for an SMS failure alert.
 */
function buildTextBody(payload: SmsFailureAlertPayload, timestamp: string): string {
  const { phone, message, context, webhookResult } = payload;

  const lines: string[] = [
    "SMS WEBHOOK FAILURE ALERT",
    "=".repeat(40),
    "",
    `Timestamp: ${timestamp}`,
    `Phone: ${phone}`,
    "",
    "--- Notification Details ---",
    `Type: ${context?.type ?? "unknown"}`,
    `Description: ${context?.description ?? "N/A"}`,
  ];

  if (context?.appointmentId) {
    lines.push(`Appointment ID: ${context.appointmentId}`);
  }
  if (context?.patientId) {
    lines.push(`Patient ID: ${context.patientId}`);
  }

  lines.push(
    "",
    "--- Failure Details ---",
    `Reason: ${failureReasonLabel(webhookResult.failureReason)}`,
    `HTTP Status: ${webhookResult.httpStatus ?? "N/A"}`,
    `Attempt Count: ${webhookResult.attemptCount}`,
    `Error Message: ${webhookResult.errorMessage ?? "N/A"}`,
    "",
    "--- Message Preview (first 200 chars) ---",
    message.slice(0, 200) + (message.length > 200 ? "..." : ""),
    "",
    "Please investigate the SMS delivery failure.",
  );

  return lines.join("\n");
}

/**
 * Builds the HTML email body for an SMS failure alert.
 */
function buildHtmlBody(payload: SmsFailureAlertPayload, timestamp: string): string {
  const { phone, message, context, webhookResult } = payload;

  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = [
    ["Timestamp", timestamp],
    ["Phone", phone],
    ["Notification Type", context?.type ?? "unknown"],
    ["Description", context?.description ?? "N/A"],
  ];

  if (context?.appointmentId) {
    rows.push(["Appointment ID", String(context.appointmentId)]);
  }
  if (context?.patientId) {
    rows.push(["Patient ID", String(context.patientId)]);
  }

  rows.push(
    ["Failure Reason", failureReasonLabel(webhookResult.failureReason)],
    ["HTTP Status", String(webhookResult.httpStatus ?? "N/A")],
    ["Attempt Count", String(webhookResult.attemptCount)],
    ["Error Message", webhookResult.errorMessage ?? "N/A"]
  );

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${escapeHtml(label)}</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const preview = message.slice(0, 200) + (message.length > 200 ? "..." : "");

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #d32f2f; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    .preview { background: #f5f5f5; padding: 12px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SMS Webhook Failure Alert</h1>
    <table>${tableRows}</table>
    <h3>Message Preview</h3>
    <div class="preview">${escapeHtml(preview)}</div>
    <p style="color:#666;font-size:14px;">Please investigate the SMS delivery failure.</p>
  </div>
</body>
</html>
`.trim();
}

/**
 * Sends an email alert to configured admins when an SMS webhook fails.
 *
 * This function is designed to be fire-and-forget safe: if any configuration
 * is missing or sending fails, it logs a warning and returns without throwing.
 */
export async function notifySmsFailure(payload: SmsFailureAlertPayload): Promise<void> {
  const emailService = getEmailService();
  if (!emailService) {
    console.log("SMS failure alert skipped: email service not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL)");
    return;
  }

  const alertEmailsEnv = process.env.SMS_FAILURE_ALERT_EMAILS;
  if (!alertEmailsEnv) {
    console.log("SMS failure alert skipped: SMS_FAILURE_ALERT_EMAILS not configured");
    return;
  }

  const recipients = alertEmailsEnv
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  if (recipients.length === 0) {
    console.log("SMS failure alert skipped: no valid recipients in SMS_FAILURE_ALERT_EMAILS");
    return;
  }

  const timestamp = new Date().toISOString();
  const subject = `[ALERT] SMS Webhook Failure - ${payload.context?.type ?? "unknown"} to ${payload.phone}`;

  try {
    await emailService.send({
      to: recipients,
      subject,
      text: buildTextBody(payload, timestamp),
      html: buildHtmlBody(payload, timestamp),
    });
    console.log(`SMS failure alert sent to ${recipients.length} recipient(s)`);
  } catch (error) {
    // Log but don't throw - we don't want alert failures to mask the original SMS failure
    console.error("Failed to send SMS failure alert email:", error instanceof Error ? error.message : error);
  }
}
