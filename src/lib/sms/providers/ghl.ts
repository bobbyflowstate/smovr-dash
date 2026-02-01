/**
 * GoHighLevel SMS Provider
 * 
 * Sends SMS via GoHighLevel webhook. GHL workflows receive the payload
 * and handle the actual SMS sending.
 */

import type { SMSProvider, SendMessageParams, SendResult, InboundMessage } from '../types';

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
        console.log(`[GHL] SMS webhook retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms backoff`);
        await sleep(backoffMs);
      }
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      
      try {
        if (attempt === 0) {
          console.log('[GHL] Sending SMS webhook to:', this.webhookUrl);
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
            console.log(`[GHL] SMS webhook sent successfully on retry ${attempt}`);
          } else {
            console.log('[GHL] SMS webhook sent successfully');
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
          console.error(`[GHL] SMS webhook failed with non-retryable status: ${response.status}`);
          return {
            success: false,
            attemptCount: attempt + 1,
            httpStatus: response.status,
            failureReason: 'HTTP_ERROR',
            error: `HTTP ${response.status}`,
          };
        }
        
        console.warn(`[GHL] SMS webhook failed with retryable status: ${response.status}`);
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (lastError.name === 'AbortError') {
          console.warn(`[GHL] SMS webhook request timed out (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        } else {
          console.warn(`[GHL] SMS webhook error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, lastError.message);
        }
      }
    }
    
    // All retries exhausted
    console.error(`[GHL] SMS webhook failed after ${MAX_RETRIES + 1} attempts`);
    
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
        console.warn('[GHL] Invalid inbound webhook payload:', body);
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
      console.error('[GHL] Failed to parse inbound webhook:', error);
      return null;
    }
  }
  
  async verifyWebhookSignature(request: Request, secret: string): Promise<boolean> {
    // GHL doesn't typically use webhook signatures
    // If you configure a secret token in the URL, that's handled at the route level
    // For now, accept all requests
    void request;
    void secret;
    return true;
  }
}

