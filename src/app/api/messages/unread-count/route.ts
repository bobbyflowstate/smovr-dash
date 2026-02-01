/**
 * Unread Count API
 * 
 * GET /api/messages/unread-count - Get total unread message count for nav badge
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'messages.unread-count',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        return NextResponse.json({ count: 0 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const count = await convex.query(api.messages.getUnreadCount, { userEmail });
      
      log.debug('Fetched unread count', { count });
      return NextResponse.json({ count });
    } catch (error) {
      log.error('Error fetching unread count', error);
      return NextResponse.json({ count: 0 });
    }
  });
}

