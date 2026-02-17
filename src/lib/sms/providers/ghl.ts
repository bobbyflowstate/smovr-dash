/**
 * GoHighLevel SMS Provider
 * 
 * Sends SMS via GoHighLevel webhook. GHL workflows receive the payload
 * and handle the actual SMS sending.
 */

import type { SMSProvider, SendMessageParams, SendResult, InboundMessage } from '../types';
import { globalLogger } from '@/lib/observability';

const log = globalLogger.child({ component: 'sms.ghl' });

// Configuration
const WEBHOOK_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

/** Sleep helper for backoff delays */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an HTTP status code should trigger a retry */
function isRetryableStatus(status: number): boolean {
  // Retry on server errors (5xx) and rate limiting (429)
  return status >= 500 || status === 429;
}

export class GHLProvider implements SMSProvider {
  readonly name = 'ghl' as const;
  
  constructor(private webhookUrl: string) {
    if (!webhookUrl) {
      throw new Error('GHL webhook URL is required');
    }
  }
  
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const payload = {
      phone: params.to,
      message: params.body,
    };
    
    let lastError: Error | null = null;
    let lastStatus: number | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Apply backoff delay before retries (not on first attempt)
      if (attempt > 0) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        log.info(`Retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms backoff`);
        await sleep(backoffMs);
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      
      try {
        if (attempt === 0) {
          log.info('Sending SMS webhook', { to: params.to });
        }
        
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          if (attempt > 0) {
            log.info(`SMS webhook sent successfully on retry ${attempt}`);
          } else {
            log.info('SMS webhook sent successfully');
          }
          
          return {
            success: true,
            messageId: `ghl-${Date.now()}`,
            attemptCount: attempt + 1,
            httpStatus: response.status,
          };
        }
        
        lastStatus = response.status;
        
        if (!isRetryableStatus(response.status)) {
          log.error(`SMS webhook failed with non-retryable status: ${response.status}`);
          return {
            success: false,
            attemptCount: attempt + 1,
            httpStatus: response.status,
            failureReason: 'HTTP_ERROR',
            error: `HTTP ${response.status}`,
          };
        }
        
        log.warn(`SMS webhook failed with retryable status: ${response.status}`);
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (lastError.name === 'AbortError') {
          log.warn(`SMS webhook request timed out`, { attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1 });
        } else {
          log.warn(`SMS webhook error`, { attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1, error: lastError.message });
        }
      }
    }
    
    // All retries exhausted
    log.error(`SMS webhook failed after ${MAX_RETRIES + 1} attempts`);
    
    return {
      success: false,
      attemptCount: MAX_RETRIES + 1,
      httpStatus: lastStatus ?? undefined,
      failureReason: lastError?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      error: lastError?.message,
    };
  }
  
  async parseInboundWebhook(request: Request): Promise<InboundMessage | null> {
    try {
      const body = await request.json();
      
      // GHL typically sends: { phone, message, ... }
      // Adjust based on actual GHL webhook format
      const phone = body.phone || body.from || body.contact_phone;
      const message = body.message || body.body || body.text;
      
      if (!phone || !message) {
        log.warn('Invalid inbound webhook payload');
        return null;
      }
      
      return {
        phone,
        body: message,
        receivedAt: new Date().toISOString(),
        providerMessageId: body.message_id || body.messageId,
        rawPayload: body,
      };
    } catch (error) {
      log.error('Failed to parse inbound webhook', error);
      return null;
    }
  }
  
  async verifyWebhookSignature(request: Request, secret: string): Promise<boolean> {
    // GHL has no standard signature scheme. When an inboundWebhookSecret
    // is configured we require the caller to pass it in an X-Webhook-Secret
    // header (set this in the GHL workflow HTTP action).
    const header = request.headers.get('X-Webhook-Secret');
    if (!header) {
      log.warn('Missing X-Webhook-Secret header');
      return false;
    }

    try {
      const { timingSafeEqual } = await import('crypto');
      const valid = timingSafeEqual(
        Buffer.from(header, 'utf-8'),
        Buffer.from(secret, 'utf-8'),
      );
      if (!valid) {
        log.warn('X-Webhook-Secret mismatch');
      }
      return valid;
    } catch {
      log.warn('X-Webhook-Secret mismatch');
      return false;
    }
  }
}

