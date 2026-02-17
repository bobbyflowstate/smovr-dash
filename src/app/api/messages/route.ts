/**
 * Messages API
 * 
 * GET /api/messages - Get conversations list
 * GET /api/messages?patientId=xxx - Get messages for a patient
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'messages.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      // Auth check
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get('patientId');
      const limitParam = searchParams.get('limit');
      const beforeParam = searchParams.get('before');

      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
      
      if (patientId) {
        // Get messages for specific patient
        log.info('Fetching messages for patient', { patientId });

        const beforeMessageCreatedAt = beforeParam ? Number(beforeParam) : undefined;
        const messages = await convex.query(api.messages.getMessagesForPatient, {
          userEmail,
          patientId: patientId as Id<'patients'>,
          limit,
          beforeMessageCreatedAt:
            typeof beforeMessageCreatedAt === 'number' && Number.isFinite(beforeMessageCreatedAt)
              ? beforeMessageCreatedAt
              : undefined,
        });

        // Mark conversation as read only when loading the newest page.
        if (!beforeParam) {
          await convex.mutation(api.messages.markConversationRead, {
            userEmail,
            patientId: patientId as Id<'patients'>,
          });
        }
        
        log.info('Fetched messages', { count: messages.length });
        return NextResponse.json(messages);
      } else {
        // Get conversations list
        log.info('Fetching conversations');

        const conversations = await convex.query(api.messages.getConversations, {
          userEmail,
          limit,
          beforeLastMessageAt: beforeParam || undefined,
        });
        
        log.info('Fetched conversations', { count: conversations.length });
        return NextResponse.json(conversations);
      }
    } catch (error) {
      log.error('Error fetching messages', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

