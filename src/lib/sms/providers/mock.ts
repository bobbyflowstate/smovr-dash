/**
 * Mock SMS Provider
 * 
 * For local development and testing. Logs messages to console
 * and simulates successful sends.
 */

import type { SMSProvider, SendMessageParams, SendResult, InboundMessage } from '../types';

export class MockSMSProvider implements SMSProvider {
  readonly name = 'mock' as const;
  
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const timestamp = new Date().toISOString();
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    console.warn('═══════════════════════════════════════════════════════════');
    console.warn('[MOCK SMS - NOT DELIVERED] Outbound Message');
    console.warn('═══════════════════════════════════════════════════════════');
    console.warn(`  To:        ${params.to}`);
    console.warn(`  From:      ${params.from || '(default)'}`);
    console.warn(`  Timestamp: ${timestamp}`);
    console.warn(`  MessageID: ${messageId}`);
    console.warn('───────────────────────────────────────────────────────────');
    console.warn(`  Body:`);
    console.warn(`  ${params.body.split('\n').join('\n  ')}`);
    console.warn('═══════════════════════════════════════════════════════════');
    
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
        console.warn('[MOCK SMS] Invalid inbound webhook payload:', body);
        return null;
      }
      
      const inbound: InboundMessage = {
        phone: body.phone,
        body: body.message,
        receivedAt: new Date().toISOString(),
        providerMessageId: body.messageId || `mock-inbound-${Date.now()}`,
        rawPayload: body,
      };
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📥 [MOCK SMS] Inbound Message Received');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  From:      ${inbound.phone}`);
      console.log(`  Timestamp: ${inbound.receivedAt}`);
      console.log(`  MessageID: ${inbound.providerMessageId}`);
      console.log('───────────────────────────────────────────────────────────');
      console.log(`  Body:`);
      console.log(`  ${inbound.body}`);
      console.log('═══════════════════════════════════════════════════════════');
      
      return inbound;
    } catch (error) {
      console.error('[MOCK SMS] Failed to parse inbound webhook:', error);
      return null;
    }
  }
  
  async verifyWebhookSignature(): Promise<boolean> {
    // Mock provider always accepts webhooks
    return true;
  }
}

