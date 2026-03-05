import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from '../../../../convex/_generated/api';
import { getAuthenticatedUser, AuthError, safeErrorMessage } from '@/lib/api-utils';
import { runWithContext, createRequestContext, getLogger } from '@/lib/observability';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'settings.get',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token } = await getAuthenticatedUser();
      log.info('Fetching team settings');
      const settings = await fetchQuery(api.teamSettings.get, {}, { token });
      return NextResponse.json(settings);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      log.error('Failed to fetch settings', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'PATCH',
    route: 'settings.update',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token } = await getAuthenticatedUser();
      const body = await request.json();

      log.info('Updating team settings', { fields: Object.keys(body).join(', ') });
      await fetchMutation(api.teamSettings.update, body, { token });
      log.info('Team settings updated');
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      log.error('Failed to update settings', error);
      return NextResponse.json(
        { error: safeErrorMessage(error, 'Failed to update settings') },
        { status: 500 },
      );
    }
  });
}
