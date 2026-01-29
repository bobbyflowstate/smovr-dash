/**
 * Email service abstraction for sending alerts.
 *
 * Provides a pluggable interface so implementations can be swapped
 * (e.g., Resend, SendGrid, or a mock for testing).
 */

import { Resend } from "resend";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Resend-backed email service implementation.
 */
export class ResendEmailService implements EmailService {
  private resend: Resend;
  private fromAddress: string;

  constructor(apiKey: string, fromAddress: string) {
    this.resend = new Resend(apiKey);
    this.fromAddress = fromAddress;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.resend.emails.send({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

/**
 * Singleton instance for reuse across Convex actions.
 * Lazily initialized from environment variables.
 */
let singleton: EmailService | null = null;

/**
 * Returns a configured EmailService instance, or null if required env vars are missing.
 *
 * Required env vars:
 * - RESEND_API_KEY: Resend API key
 * - RESEND_FROM_EMAIL: Sender email address (must be verified in Resend)
 */
export function getEmailService(): EmailService | null {
  if (singleton) {
    return singleton;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return null;
  }

  singleton = new ResendEmailService(apiKey, fromEmail);
  return singleton;
}

/**
 * Resets the singleton (useful for testing).
 */
export function resetEmailServiceSingleton(): void {
  singleton = null;
}
