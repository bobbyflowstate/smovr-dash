/**
 * SMS Provider Factory (Convex-side)
 *
 * Returns the right SMSProvider for a given team (DB config) or for the
 * global environment fallback.
 *
 * Because this runs inside Convex actions where there is no access to
 * the Convex query layer, team config must be passed in by the caller.
 */

import {
  GHLProvider,
  TwilioProvider,
  MockSMSProvider,
  type SMSProvider,
  type TwilioConfig,
} from "./sms_provider";
import { createConvexLogger } from "./lib/logger";

const log = createConvexLogger({ functionName: "sms.factory" });

// ============================================
// Team-config-based provider creation
// ============================================

export interface TeamSmsConfig {
  provider: "ghl" | "twilio" | "mock";
  isEnabled: boolean;
  webhookUrl?: string;
  fromNumber?: string;
  credentialsEnvPrefix?: string;
}

/**
 * Create a provider from a team's persisted SMS config.
 * Returns `null` if the config is disabled or insufficient.
 */
export function createProviderFromConfig(config: TeamSmsConfig): SMSProvider | null {
  if (!config.isEnabled) return null;

  switch (config.provider) {
    case "ghl": {
      const url = config.webhookUrl || process.env.GHL_SMS_WEBHOOK_URL;
      if (!url) return null;
      return new GHLProvider(url);
    }

    case "twilio": {
      const prefix = config.credentialsEnvPrefix;
      const accountSid = prefix
        ? process.env[`${prefix}_TWILIO_ACCOUNT_SID`] || process.env.TWILIO_ACCOUNT_SID
        : process.env.TWILIO_ACCOUNT_SID;
      const authToken = prefix
        ? process.env[`${prefix}_TWILIO_AUTH_TOKEN`] || process.env.TWILIO_AUTH_TOKEN
        : process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = prefix
        ? process.env[`${prefix}_TWILIO_FROM_NUMBER`] || process.env.TWILIO_FROM_NUMBER
        : process.env.TWILIO_FROM_NUMBER;
      const messagingServiceSid = prefix
        ? process.env[`${prefix}_TWILIO_MESSAGING_SERVICE_SID`] || process.env.TWILIO_MESSAGING_SERVICE_SID
        : process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) return null;
      return new TwilioProvider({ accountSid, authToken, fromNumber, messagingServiceSid } as TwilioConfig);
    }

    case "mock":
      return new MockSMSProvider();

    default:
      return null;
  }
}

// ============================================
// Environment-based default provider (no DB)
// ============================================

/**
 * Build a provider from environment variables alone.
 *
 * Priority:
 *  1. Twilio (if TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN set)
 *  2. GHL   (if GHL_SMS_WEBHOOK_URL set)
 *  3. Mock  (development only — throws in production)
 */
export function getDefaultProvider(): SMSProvider {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioMsgSvc = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  if (twilioSid && twilioToken && (twilioMsgSvc || twilioFrom)) {
    log.info("Using Twilio provider");
    return new TwilioProvider({
      accountSid: twilioSid,
      authToken: twilioToken,
      messagingServiceSid: twilioMsgSvc,
      fromNumber: twilioFrom,
    });
  }

  const ghlUrl = process.env.GHL_SMS_WEBHOOK_URL;
  if (ghlUrl) {
    log.info("Using GHL provider");
    return new GHLProvider(ghlUrl);
  }

  log.warn(
    "No SMS provider configured — messages will NOT be delivered. " +
    "Set TWILIO_* or GHL_SMS_WEBHOOK_URL env vars."
  );
  return new MockSMSProvider();
}
