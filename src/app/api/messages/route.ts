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
      
      if (patientId) {
        // Get messages for specific patient
        log.info('Fetching messages for patient', { patientId });
        
        const messages = await convex.query(api.messages.getMessagesForPatient, {
          userEmail,
          patientId: patientId as Id<'patients'>,
        });
        
        // Mark conversation as read
        await convex.mutation(api.messages.markConversationRead, {
          userEmail,
          patientId: patientId as Id<'patients'>,
        });
        
        log.info('Fetched messages', { count: messages.length });
        return NextResponse.json(messages);
      } else {
        // Get conversations list
        log.info('Fetching conversations');
        
        const conversations = await convex.query(api.messages.getConversations, {
          userEmail,
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

