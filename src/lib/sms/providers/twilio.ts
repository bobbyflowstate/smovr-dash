/**
 * Twilio SMS Provider
 * 
 * Sends SMS via Twilio REST API. Requires account SID, auth token, and either
 * a from number OR a messaging service SID.
 * Credentials are loaded from environment variables.
 */

import type { SMSProvider, SendMessageParams, SendResult, InboundMessage } from '../types';
import { globalLogger } from '@/lib/observability';

const log = globalLogger.child({ component: 'sms.twilio' });

// Twilio API configuration
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const TIMEOUT_MS = 10000;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber?: string;              // Either fromNumber or messagingServiceSid required
  messagingServiceSid?: string;     // Twilio Messaging Service SID (starts with MG)
}

export class TwilioProvider implements SMSProvider {
  readonly name = 'twilio' as const;
  
  constructor(private config: TwilioConfig) {
    if (!config.accountSid || !config.authToken) {
      throw new Error('Twilio requires accountSid and authToken');
    }
    if (!config.fromNumber && !config.messagingServiceSid) {
      throw new Error('Twilio requires either fromNumber or messagingServiceSid');
    }
  }
  
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const url = `${TWILIO_API_BASE}/Accounts/${this.config.accountSid}/Messages.json`;
    
    // Twilio uses form-encoded body
    const formData = new URLSearchParams();
    formData.append('To', params.to);
    formData.append('Body', params.body);
    
    // Use MessagingServiceSid if available, otherwise use From number
    if (this.config.messagingServiceSid) {
      formData.append('MessagingServiceSid', this.config.messagingServiceSid);
    } else {
      const from = params.from || this.config.fromNumber!;
      formData.append('From', from);
    }
    
    // Basic auth header
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      log.info('Sending SMS', { to: params.to });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (response.ok) {
        log.info('SMS sent successfully', { sid: data.sid });
        return {
          success: true,
          messageId: data.sid,
          attemptCount: 1,
          httpStatus: response.status,
        };
      }
      
      log.error('SMS send failed', new Error(data.message || data.code), { httpStatus: response.status });
      return {
        success: false,
        attemptCount: 1,
        httpStatus: response.status,
        failureReason: response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
        error: data.message || `HTTP ${response.status}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      
      log.error('SMS send error', err);
      return {
        success: false,
        attemptCount: 1,
        failureReason: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: err.message,
      };
    }
  }
  
  async parseInboundWebhook(request: Request): Promise<InboundMessage | null> {
    try {
      // Twilio sends form-encoded data
      const text = await request.text();
      const params = new URLSearchParams(text);
      
      const from = params.get('From');
      const body = params.get('Body');
      const messageSid = params.get('MessageSid');
      
      if (!from || !body) {
        log.warn('Invalid inbound webhook - missing From or Body');
        return null;
      }
      
      return {
        phone: from,
        body,
        receivedAt: new Date().toISOString(),
        providerMessageId: messageSid || undefined,
        rawPayload: Object.fromEntries(params),
      };
    } catch (error) {
      log.error('Failed to parse inbound webhook', error);
      return null;
    }
  }
  
  async verifyWebhookSignature(request: Request, secret: string): Promise<boolean> {
    // Twilio signs webhooks with HMAC-SHA1(authToken, url + sorted POST params)
    // https://www.twilio.com/docs/usage/security#validating-requests
    const signature = request.headers.get('X-Twilio-Signature');
    if (!signature) {
      log.warn('No X-Twilio-Signature header present');
      return false;
    }

    try {
      const url = request.url;
      const body = await request.text();
      const params = new URLSearchParams(body);

      // Build the validation string: URL + sorted param key-value pairs
      let dataToSign = url;
      const sortedKeys = Array.from(params.keys()).sort();
      for (const key of sortedKeys) {
        dataToSign += key + params.get(key);
      }

      const { createHmac, timingSafeEqual } = await import('crypto');
      const expected = createHmac('sha1', secret)
        .update(dataToSign, 'utf-8')
        .digest('base64');

      const sigBuf = Buffer.from(signature, 'base64');
      const expectedBuf = Buffer.from(expected, 'base64');

      if (sigBuf.length !== expectedBuf.length) {
        log.warn('Webhook signature length mismatch');
        return false;
      }

      const valid = timingSafeEqual(sigBuf, expectedBuf);
      if (!valid) {
        log.warn('Webhook signature mismatch');
      }
      return valid;
    } catch (error) {
      log.error('Error verifying webhook signature', error);
      return false;
    }
  }
}

/**
 * Create a Twilio provider from environment variables
 * 
 * Supports MessagingServiceSid mode:
 * Set {prefix}_TWILIO_MESSAGING_SERVICE_SID (or global fallback).
 */
export function createTwilioFromEnv(envPrefix: string): TwilioProvider {
  const accountSid = process.env[`${envPrefix}_TWILIO_ACCOUNT_SID`] || process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env[`${envPrefix}_TWILIO_AUTH_TOKEN`] || process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env[`${envPrefix}_TWILIO_MESSAGING_SERVICE_SID`] || process.env.TWILIO_MESSAGING_SERVICE_SID;
  
  if (!accountSid || !authToken) {
    throw new Error(
      `Missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN ` +
      `(or ${envPrefix}_TWILIO_ACCOUNT_SID and ${envPrefix}_TWILIO_AUTH_TOKEN)`
    );
  }
  
  if (!messagingServiceSid) {
    throw new Error(
      `Missing Twilio sender. Set TWILIO_MESSAGING_SERVICE_SID ` +
      `(or ${envPrefix}_TWILIO_MESSAGING_SERVICE_SID)`
    );
  }
  
  return new TwilioProvider({ accountSid, authToken, messagingServiceSid });
}

/**
 * Create a Twilio provider from global environment variables (no prefix)
 */
export function createTwilioFromGlobalEnv(): TwilioProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  
  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }
  
  if (!messagingServiceSid) {
    throw new Error('Missing TWILIO_MESSAGING_SERVICE_SID');
  }
  
  return new TwilioProvider({ accountSid, authToken, messagingServiceSid });
}
