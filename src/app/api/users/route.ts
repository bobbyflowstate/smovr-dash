import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

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
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      log.info('Fetching user info');

      await fetchMutation(api.users.ensureTeam, {}, { token });

      const userInfo = await fetchQuery(api.users.currentUser, {}, { token });

      if (!userInfo) {
        log.warn('User not found');
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
      }

      extendContext({ userEmail: userInfo.userEmail });

      log.info('User info fetched', { teamName: userInfo.teamName });
      return NextResponse.json({
        userName: userInfo.userName,
        userEmail: userInfo.userEmail,
        teamName: userInfo.teamName || "Unknown Team",
        teamId: userInfo.teamId,
        userId: userInfo.userId
      });
    } catch (error) {
      log.error('Failed to get user info', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
