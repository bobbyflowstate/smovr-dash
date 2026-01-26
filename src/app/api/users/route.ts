import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/users - Get current user and team info
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'users.me',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      // 🔐 Server-side authentication validation
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const userIdentifier = getUserIdentifier(claims);
      const userName = extractDisplayName(claims);
      const logtoUserId = claims.sub;

      if (!userIdentifier) {
        log.warn('User identifier required');
        return NextResponse.json({ error: 'User identifier required' }, { status: 400 });
      }

      extendContext({ userEmail: userIdentifier });
      log.info('Fetching user info');

      // 🔒 Ensure user exists and get team info
      await convex.mutation(api.users.getOrCreateUserByEmail, {
        email: userIdentifier,
        name: userName,
        logtoUserId,
      });

      // Get user with team info
      const userInfo = await convex.query(api.users.getUserWithTeam, { 
        userEmail: userIdentifier 
      });

      log.info('User info fetched', { teamName: userInfo?.teamName });
      return NextResponse.json({
        userName: userInfo?.userName || userName, // Use Convex name, fallback to Logto name
        userEmail: userIdentifier,
        teamName: userInfo?.teamName || "Unknown Team",
        teamId: userInfo?.teamId,
        userId: userInfo?.userId
      });
    } catch (error) {
      log.error('Failed to get user info', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
