/**
 * SMS Provider Abstraction (Convex-side)
 *
 * Portable provider implementations that work in both the Convex action
 * runtime and the Next.js server. Only built-in APIs are used (fetch,
 * Buffer, URLSearchParams) — no npm SDK dependencies.
 */

import { createConvexLogger } from "./lib/logger";

// ============================================
// Types
// ============================================

export type SMSProviderType = "ghl" | "twilio" | "vonage" | "mock";

export type SendFailureReason =
  | "PROVIDER_NOT_CONFIGURED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_PHONE"
  | "RATE_LIMITED"
  | "UNKNOWN";

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  failureReason?: SendFailureReason;
  attemptCount: number;
  httpStatus?: number;
}

export interface SendMessageParams {
  to: string;
  body: string;
  from?: string;
}

export interface SMSProvider {
  readonly name: SMSProviderType;
  sendMessage(params: SendMessageParams): Promise<SendResult>;
}

// ============================================
// GHL Provider
// ============================================

const GHL_TIMEOUT_MS = 10_000;
const GHL_MAX_RETRIES = 3;
const GHL_INITIAL_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export class GHLProvider implements SMSProvider {
  readonly name = "ghl" as const;

  constructor(private webhookUrl: string) {
    if (!webhookUrl) throw new Error("GHL webhook URL is required");
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const log = createConvexLogger({ functionName: "sms.ghl.send", provider: "ghl" });
    const payload = { phone: params.to, message: params.body };
    let lastError: Error | null = null;
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt <= GHL_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = GHL_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        log.info(`Retry ${attempt}/${GHL_MAX_RETRIES} after ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);

      try {
        if (attempt === 0) log.info("Sending SMS", { to: params.to });

        const response = await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          log.info("SMS sent successfully");
          return {
            success: true,
            messageId: `ghl-${Date.now()}`,
            attemptCount: attempt + 1,
            httpStatus: response.status,
          };
        }

        lastStatus = response.status;
        if (!isRetryableStatus(response.status)) {
          log.error(`Non-retryable status: ${response.status}`);
          return {
            success: false,
            attemptCount: attempt + 1,
            httpStatus: response.status,
            failureReason: "HTTP_ERROR",
            error: `HTTP ${response.status}`,
          };
        }
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    log.error(`Failed after ${GHL_MAX_RETRIES + 1} attempts`);
    return {
      success: false,
      attemptCount: GHL_MAX_RETRIES + 1,
      httpStatus: lastStatus ?? undefined,
      failureReason: lastError?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      error: lastError?.message,
    };
  }
}

// ============================================
// Twilio Provider
// ============================================

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_TIMEOUT_MS = 10_000;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
  messagingServiceSid?: string;
}

export class TwilioProvider implements SMSProvider {
  readonly name = "twilio" as const;

  constructor(private config: TwilioConfig) {
    if (!config.accountSid || !config.authToken) {
      throw new Error("Twilio requires accountSid and authToken");
    }
    if (!config.fromNumber && !config.messagingServiceSid) {
      throw new Error("Twilio requires either fromNumber or messagingServiceSid");
    }
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const log = createConvexLogger({ functionName: "sms.twilio.send", provider: "twilio" });
    const url = `${TWILIO_API_BASE}/Accounts/${this.config.accountSid}/Messages.json`;
    const formData = new URLSearchParams();
    formData.append("To", params.to);
    formData.append("Body", params.body);

    if (this.config.messagingServiceSid) {
      formData.append("MessagingServiceSid", this.config.messagingServiceSid);
    } else {
      formData.append("From", params.from || this.config.fromNumber!);
    }

    const auth = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`
    ).toString("base64");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS);

    try {
      log.info("Sending SMS", { to: params.to });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok) {
        log.info("SMS sent successfully", { sid: data.sid });
        return {
          success: true,
          messageId: data.sid,
          attemptCount: 1,
          httpStatus: response.status,
        };
      }

      log.error("SMS send failed", new Error(data.message || data.code), { httpStatus: response.status });
      return {
        success: false,
        attemptCount: 1,
        httpStatus: response.status,
        failureReason: response.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
        error: data.message || `HTTP ${response.status}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      log.error("SMS send error", err);
      return {
        success: false,
        attemptCount: 1,
        failureReason: err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
        error: err.message,
      };
    }
  }
}

// ============================================
// Mock Provider
// ============================================

export class MockSMSProvider implements SMSProvider {
  readonly name = "mock" as const;

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const log = createConvexLogger({ functionName: "sms.mock.send", provider: "mock" });
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    log.warn("MOCK SMS - NOT DELIVERED", { to: params.to, messageId });
    return { success: true, messageId, attemptCount: 1, httpStatus: 200 };
  }
}
