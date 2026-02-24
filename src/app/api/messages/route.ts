/**
 * Messages API
 * 
 * GET /api/messages - Get conversations list
 * GET /api/messages?patientId=xxx - Get messages for a patient
 */

import { NextRequest, NextResponse } from 'next/server';
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { runWithContext, createRequestContext, getLogger } from '@/lib/observability';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'messages.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get('patientId');
      const limitParam = searchParams.get('limit');
      const beforeParam = searchParams.get('before');

      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
      
      if (patientId) {
        log.info('Fetching messages for patient', { patientId });

        const beforeMessageCreatedAt = beforeParam ? Number(beforeParam) : undefined;
        const messages = await fetchQuery(api.messages.getMessagesForPatient, {
          userEmail: "",
          patientId: patientId as Id<'patients'>,
          limit,
          beforeMessageCreatedAt:
            typeof beforeMessageCreatedAt === 'number' && Number.isFinite(beforeMessageCreatedAt)
              ? beforeMessageCreatedAt
              : undefined,
        }, { token });

        if (!beforeParam) {
          await fetchMutation(api.messages.markConversationRead, {
            userEmail: "",
            patientId: patientId as Id<'patients'>,
          }, { token });
        }
        
        log.info('Fetched messages', { count: messages.length });
        return NextResponse.json(messages);
      } else {
        log.info('Fetching conversations');

        const conversations = await fetchQuery(api.messages.getConversations, {
          userEmail: "",
          limit,
          beforeLastMessageAt: beforeParam || undefined,
        }, { token });
        
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
