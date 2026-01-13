import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/reminder-attempts/[appointmentId] - Get reminder attempt audit trail (authenticated)
export async function GET(
  request: NextRequest,
  { params }: { params: { appointmentId: string } }
) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appointmentId = params.appointmentId as Id<"appointments">;
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 100;

    const attempts = await convex.query(api.reminders.getReminderAttemptsForAppointment, {
      userEmail: claims.email,
      appointmentId,
      limit,
    });

    return NextResponse.json({ appointmentId, attempts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

