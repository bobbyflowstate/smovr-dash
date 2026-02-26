/**
 * Unread Count API
 * 
 * GET /api/messages/unread-count - Get total unread message count for nav badge
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError } from '@/lib/api-utils';
import { fetchQuery } from "convex/nextjs";
import { api } from '../../../../../convex/_generated/api';
import { runWithContext, createRequestContext, getLogger } from '@/lib/observability';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'messages.unread-count',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { token, userEmail } = await getAuthenticatedUser();
      
      const count = await fetchQuery(api.messages.getUnreadCount, { userEmail }, { token });
      
      log.debug('Fetched unread count', { count });
      return NextResponse.json({ count });
    } catch (error) {
      if (error instanceof AuthError) { return NextResponse.json({ count: 0 }); }
      log.error('Error fetching unread count', error);
      return NextResponse.json({ count: 0 });
    }
  });
}
