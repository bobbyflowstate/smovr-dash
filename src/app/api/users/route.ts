import { fetchMutation } from "convex/nextjs";
import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';
import { getAuthenticatedUser, AuthError } from '@/lib/api-utils';

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
      const { token, userEmail, userName, teamId, teamName, userId } = await getAuthenticatedUser();

      log.info('Fetching user info');

      await fetchMutation(api.users.ensureTeam, {}, { token });

      extendContext({ userEmail });

      log.info('User info fetched', { teamName });
      return NextResponse.json({
        userName,
        userEmail,
        teamName: teamName || "Unknown Team",
        teamId,
        userId,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      log.error('Failed to get user info', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
