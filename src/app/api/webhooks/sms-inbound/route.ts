/**
 * Inbound SMS Webhook
 * 
 * Receives inbound SMS messages from SMS providers (GHL, Twilio, etc.)
 * and stores them in the messages table.
 * 
 * POST /api/webhooks/sms-inbound?provider=ghl&team=TEAM_ID
 * POST /api/webhooks/sms-inbound?provider=twilio&team=TEAM_ID
 * 
 * The team parameter is required to route the message to the correct team.
 * If the team has an inboundWebhookSecret configured, the provider's
 * webhook signature is verified before processing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { internal } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { parseInboundWebhook, GHLProvider, TwilioProvider, MockSMSProvider } from '@/lib/sms';
import type { SMSProvider, SMSProviderConfig } from '@/lib/sms';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';
import { createAdminConvexClient } from '@/lib/convex-server';

const convex = createAdminConvexClient();

/**
 * Build a lightweight provider instance for signature verification only.
 * Full credentials are not needed — just the class that implements
 * verifyWebhookSignature for the right provider type.
 */
function getProviderForVerification(providerType: SMSProviderConfig['provider']): SMSProvider | null {
  switch (providerType) {
    case 'twilio':
      // Minimal instance — sendMessage is not called
      return new TwilioProvider({
        accountSid: 'unused',
        authToken: 'unused',
        fromNumber: '+10000000000',
      });
    case 'ghl':
      return new GHLProvider('unused-for-verification');
    case 'mock':
      return new MockSMSProvider();
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'webhooks.sms-inbound',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { searchParams } = new URL(request.url);
      const providerParam = searchParams.get('provider') || 'ghl';
      const teamIdParam = searchParams.get('team');
      
      // Validate provider
      const validProviders = ['ghl', 'twilio', 'vonage', 'mock'] as const;
      if (!validProviders.includes(providerParam as any)) {
        log.warn('Invalid provider parameter', { provider: providerParam });
        return NextResponse.json(
          { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
          { status: 400 }
        );
      }
      
      const provider = providerParam as typeof validProviders[number];
      extendContext({ provider });
      
      // Team ID is required
      if (!teamIdParam) {
        log.warn('Missing team parameter');
        return NextResponse.json(
          { error: 'Missing required "team" parameter' },
          { status: 400 }
        );
      }
      
      const teamId = teamIdParam as Id<'teams'>;
      extendContext({ teamId });
      
      log.info('Processing inbound SMS webhook', { provider, teamId });

      // --- Webhook signature verification ---
      const smsConfig = await convex.query(internal.smsConfig.getByTeamId, { teamId });
      const webhookSecret = smsConfig?.inboundWebhookSecret;

      if (webhookSecret) {
        const verifier = getProviderForVerification(provider);
        if (verifier?.verifyWebhookSignature) {
          // Clone so the body can be read again for parsing
          const verifyClone = request.clone();
          const valid = await verifier.verifyWebhookSignature(verifyClone, webhookSecret);
          if (!valid) {
            log.warn('Webhook signature verification failed', { provider, teamId });
            return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
          }
          log.info('Webhook signature verified');
        }
      }
      
      // Clone the request since we need to read the body
      const clonedRequest = request.clone();
      
      // Parse the inbound message using the appropriate provider
      const inboundMessage = await parseInboundWebhook(provider, clonedRequest);
      
      if (!inboundMessage) {
        log.warn('Failed to parse inbound message');
        return NextResponse.json(
          { error: 'Failed to parse inbound message' },
          { status: 400 }
        );
      }
      
      log.info('Parsed inbound message', { 
        phone: inboundMessage.phone,
        bodyLength: inboundMessage.body.length,
      });
      
      // Store the message in Convex
      const result = await convex.mutation(internal.messages.createInboundMessage, {
        teamId,
        phone: inboundMessage.phone,
        body: inboundMessage.body,
        providerMessageId: inboundMessage.providerMessageId,
      });
      
      if (!result) {
        // Message was received but no matching patient found
        log.warn('No patient found for phone number', { phone: inboundMessage.phone });
        // Still return 200 to acknowledge receipt
        return NextResponse.json({
          ok: true,
          warning: 'Message received but no matching patient found',
          phone: inboundMessage.phone,
        });
      }
      
      log.info('Stored inbound message', { 
        messageId: result.messageId,
        patientId: result.patientId,
      });
      
      return NextResponse.json({
        ok: true,
        messageId: result.messageId,
        patientId: result.patientId,
      });
    } catch (error) {
      log.error('Error processing inbound SMS webhook', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
