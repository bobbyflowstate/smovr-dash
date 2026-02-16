/**
 * SMS Provider Factory
 * 
 * Central module for getting SMS providers. Loads team configuration
 * and returns the appropriate provider instance.
 */

import { internal } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import type { AdminConvexClient } from '@/lib/convex-server';
import { globalLogger } from '@/lib/observability';

const log = globalLogger.child({ component: 'sms.factory' });

import type { SMSProvider, SMSProviderConfig, SendResult, InboundMessage } from './types';
import { MockSMSProvider } from './providers/mock';
import { GHLProvider } from './providers/ghl';
import { createTwilioFromEnv, createTwilioFromGlobalEnv, TwilioProvider } from './providers/twilio';

// Re-export types
export * from './types';
export { MockSMSProvider } from './providers/mock';
export { GHLProvider } from './providers/ghl';
export { TwilioProvider, createTwilioFromEnv, createTwilioFromGlobalEnv } from './providers/twilio';

// ============================================
// Provider Factory
// ============================================

/**
 * Get SMS provider for a team
 * 
 * Loads team's SMS configuration from Convex and returns the
 * appropriate provider instance with credentials loaded from env vars.
 */
export async function getSMSProviderForTeam(
  convex: AdminConvexClient,
  teamId: Id<'teams'>
): Promise<SMSProvider | null> {
  try {
    // Get team's SMS config from Convex (internal query)
    const config = await convex.query(internal.smsConfig.getByTeamId, { teamId });
    
    if (!config || !config.isEnabled) {
      log.debug(`No SMS config or disabled for team`, { teamId });
      return null;
    }
    
    return createProviderFromConfig(config);
  } catch (error) {
    log.error(`Error getting provider for team`, error, { teamId });
    return null;
  }
}

/**
 * Create a provider from configuration
 * Used internally and for testing
 */
export function createProviderFromConfig(config: SMSProviderConfig): SMSProvider {
  switch (config.provider) {
    case 'mock':
      return new MockSMSProvider();
      
    case 'ghl': {
      // GHL uses webhook URL - check config first, then env var fallback
      const webhookUrl = config.webhookUrl || process.env.GHL_SMS_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('GHL provider requires webhookUrl in config or GHL_SMS_WEBHOOK_URL env var');
      }
      return new GHLProvider(webhookUrl);
    }
      
    case 'twilio': {
      // Try prefixed env vars first, then global
      if (config.credentialsEnvPrefix) {
        return createTwilioFromEnv(config.credentialsEnvPrefix);
      }
      // Fall back to global Twilio env vars
      return createTwilioFromGlobalEnv();
    }
      
    case 'vonage':
      // TODO: Implement Vonage provider
      throw new Error('Vonage provider not yet implemented');
      
    default:
      throw new Error(`Unknown SMS provider: ${config.provider}`);
  }
}

/**
 * Get the default SMS provider (for backwards compatibility)
 * 
 * Priority:
 * 1. Twilio (if TWILIO_ACCOUNT_SID is set)
 * 2. GHL (if GHL_SMS_WEBHOOK_URL is set)
 * 3. Mock provider (fallback)
 * 
 * This is used when team-specific config is not available.
 */
export function getDefaultSMSProvider(): SMSProvider {
  // Try Twilio first
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
  
  if (twilioAccountSid && twilioAuthToken && (twilioMessagingServiceSid || twilioFromNumber)) {
    log.info('Using Twilio provider');
    return new TwilioProvider({
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      messagingServiceSid: twilioMessagingServiceSid,
      fromNumber: twilioFromNumber,
    });
  }
  
  // Fall back to GHL
  const ghlWebhookUrl = process.env.GHL_SMS_WEBHOOK_URL;
  if (ghlWebhookUrl) {
    log.info('Using GHL provider');
    return new GHLProvider(ghlWebhookUrl);
  }
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[SMS] FATAL: No SMS provider configured in production. ' +
      'Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN or GHL_SMS_WEBHOOK_URL.'
    );
  }

  log.warn(
    'No SMS provider configured — messages will NOT be delivered. ' +
    'Set TWILIO_* or GHL_SMS_WEBHOOK_URL env vars.'
  );
  return new MockSMSProvider();
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Send an SMS message using the team's configured provider
 * 
 * Returns null if team has no SMS configuration.
 */
export async function sendSMSForTeam(
  convex: AdminConvexClient,
  teamId: Id<'teams'>,
  to: string,
  body: string
): Promise<SendResult | null> {
  const provider = await getSMSProviderForTeam(convex, teamId);
  
  if (!provider) {
    return null;
  }
  
  return provider.sendMessage({ to, body });
}

/**
 * Send an SMS using the default provider (backwards compatible)
 */
export async function sendSMS(to: string, body: string): Promise<SendResult> {
  const provider = getDefaultSMSProvider();
  return provider.sendMessage({ to, body });
}

/**
 * Parse an inbound webhook using the specified provider
 */
export async function parseInboundWebhook(
  providerType: SMSProviderConfig['provider'],
  request: Request,
  config?: Partial<SMSProviderConfig>
): Promise<InboundMessage | null> {
  let provider: SMSProvider;
  
  switch (providerType) {
    case 'mock':
      provider = new MockSMSProvider();
      break;
    case 'ghl':
      provider = new GHLProvider(config?.webhookUrl || 'unused-for-inbound');
      break;
    case 'twilio':
      // For inbound parsing, we don't need full credentials
      // Create a minimal instance just for parsing
      provider = {
        name: 'twilio',
        sendMessage: async () => ({ success: false, attemptCount: 0, error: 'Not configured for send' }),
        parseInboundWebhook: async (req: Request) => {
          const text = await req.text();
          const params = new URLSearchParams(text);
          const from = params.get('From');
          const body = params.get('Body');
          if (!from || !body) return null;
          return {
            phone: from,
            body,
            receivedAt: new Date().toISOString(),
            providerMessageId: params.get('MessageSid') || undefined,
            rawPayload: Object.fromEntries(params),
          };
        },
      } as SMSProvider;
      break;
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
  
  return provider.parseInboundWebhook(request);
}

