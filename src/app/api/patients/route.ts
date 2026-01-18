import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/patients - Get team's patients for autocomplete (authenticated)
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'patients.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      // 🔐 Server-side authentication validation
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const userEmail = claims.email;
      extendContext({ userEmail });
      
      log.info('Fetching patients');

      // Get user to find their teamId
      const user = await convex.query(api.users.getUserWithTeam, { 
        userEmail 
      });

      // If user doesn't exist or has no team yet, return empty array
      if (!user || !user.teamId) {
        log.info('User has no team yet, returning empty patients');
        return NextResponse.json([]);
      }

      // 🔒 Get patients for user's team only
      const patients = await convex.query(api.patients.getByTeam, { 
        teamId: user.teamId as Id<"teams">
      });

      log.info('Patients fetched', { count: patients.length });
      return NextResponse.json(patients);
    } catch (error) {
      log.error('Failed to fetch patients', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
