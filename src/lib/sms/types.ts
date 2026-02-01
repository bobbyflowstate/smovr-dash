/**
 * SMS Provider Abstraction Layer
 * 
 * This module provides a pluggable interface for SMS providers,
 * allowing easy switching between GoHighLevel, Twilio, Vonage, etc.
 */

import { Id } from '../../../convex/_generated/dataModel';

// ============================================
// Send Result Types
// ============================================

export type SendFailureReason =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_PHONE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  failureReason?: SendFailureReason;
  attemptCount: number;
  httpStatus?: number;
}

// ============================================
// Inbound Message Types
// ============================================

export interface InboundMessage {
  phone: string;
  body: string;
  receivedAt: string; // ISO timestamp
  providerMessageId?: string;
  rawPayload?: Record<string, unknown>;
}

// ============================================
// Provider Configuration Types
// ============================================

export type SMSProviderType = 'ghl' | 'twilio' | 'vonage' | 'mock';

export interface SMSProviderConfig {
  provider: SMSProviderType;
  isEnabled: boolean;
  fromNumber?: string;
  
  // GHL-specific
  webhookUrl?: string;
  
  // API-based providers (Twilio, Vonage)
  credentialsEnvPrefix?: string;
  
  // Webhook verification
  inboundWebhookSecret?: string;
}

// ============================================
// Provider Interface
// ============================================

export interface SendMessageParams {
  to: string;
  body: string;
  from?: string;
}

export interface SMSProvider {
  /** Provider identifier */
  readonly name: SMSProviderType;
  
  /**
   * Send an SMS message
   */
  sendMessage(params: SendMessageParams): Promise<SendResult>;
  
  /**
   * Parse an inbound webhook request into a standardized message format
   * Returns null if the request is not a valid inbound message
   */
  parseInboundWebhook(request: Request): Promise<InboundMessage | null>;
  
  /**
   * Verify webhook signature (optional - not all providers support this)
   * Returns true if signature is valid, false otherwise
   */
  verifyWebhookSignature?(request: Request, secret: string): Promise<boolean>;
}

// ============================================
// Message Context Types (for template resolution)
// ============================================

export interface MessageContext {
  patientName?: string;
  patientPhone?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentId?: Id<'appointments'>;
  teamName?: string;
  hospitalAddress?: string;
}

// ============================================
// Template Types
// ============================================

export interface MessageTemplate {
  id: Id<'messageTemplates'>;
  name: string;
  body: string;
  category?: string;
}

/**
 * Resolve placeholders in a template body
 * Supported: {{patientName}}, {{appointmentDate}}, {{appointmentTime}}
 */
export function resolveTemplatePlaceholders(
  template: string,
  context: MessageContext
): string {
  let resolved = template;
  
  if (context.patientName) {
    resolved = resolved.replace(/\{\{patientName\}\}/g, context.patientName);
  } else {
    // Remove placeholder if no value
    resolved = resolved.replace(/\{\{patientName\}\}/g, '');
  }
  
  if (context.appointmentDate) {
    resolved = resolved.replace(/\{\{appointmentDate\}\}/g, context.appointmentDate);
  } else {
    resolved = resolved.replace(/\{\{appointmentDate\}\}/g, '');
  }
  
  if (context.appointmentTime) {
    resolved = resolved.replace(/\{\{appointmentTime\}\}/g, context.appointmentTime);
  } else {
    resolved = resolved.replace(/\{\{appointmentTime\}\}/g, '');
  }
  
  if (context.teamName) {
    resolved = resolved.replace(/\{\{teamName\}\}/g, context.teamName);
  } else {
    resolved = resolved.replace(/\{\{teamName\}\}/g, '');
  }
  
  if (context.hospitalAddress) {
    resolved = resolved.replace(/\{\{hospitalAddress\}\}/g, context.hospitalAddress);
  } else {
    resolved = resolved.replace(/\{\{hospitalAddress\}\}/g, '');
  }
  
  // Clean up any double spaces from removed placeholders
  resolved = resolved.replace(/\s+/g, ' ').trim();
  
  return resolved;
}

