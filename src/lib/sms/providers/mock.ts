/**
 * Mock SMS Provider
 * 
 * For local development and testing. Logs messages to console
 * and simulates successful sends.
 */

import type { SMSProvider, SendMessageParams, SendResult, InboundMessage } from '../types';
import { globalLogger } from '@/lib/observability';

const log = globalLogger.child({ component: 'sms.mock' });

export class MockSMSProvider implements SMSProvider {
  readonly name = 'mock' as const;
  
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const timestamp = new Date().toISOString();
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    log.warn('MOCK SMS - NOT DELIVERED', {
      to: params.to,
      from: params.from || '(default)',
      messageId,
    }, { body: params.body });
    
    return {
      success: true,
      messageId,
      attemptCount: 1,
      httpStatus: 200,
    };
  }
  
  async parseInboundWebhook(request: Request): Promise<InboundMessage | null> {
    try {
      const body = await request.json();
      
      // Expected format: { phone: string, message: string }
      if (!body.phone || !body.message) {
        log.warn('Invalid inbound webhook payload');
        return null;
      }
      
      const inbound: InboundMessage = {
        phone: body.phone,
        body: body.message,
        receivedAt: new Date().toISOString(),
        providerMessageId: body.messageId || `mock-inbound-${Date.now()}`,
        rawPayload: body,
      };
      
      log.info('MOCK SMS - Inbound message received', {
        from: inbound.phone,
        messageId: inbound.providerMessageId,
      }, { body: inbound.body });
      
      return inbound;
    } catch (error) {
      log.error('Failed to parse inbound webhook', error);
      return null;
    }
  }
  
  async verifyWebhookSignature(): Promise<boolean> {
    // Mock provider always accepts webhooks
    return true;
  }
}

