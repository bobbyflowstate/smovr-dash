import { NextRequest, NextResponse } from 'next/server';
import { fetchQuery } from "convex/nextjs";
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { getAuthenticatedUser, AuthError } from '@/lib/api-utils';

// GET /api/reminder-attempts/[appointmentId] - Get reminder attempt audit trail (authenticated)
export async function GET(
  request: NextRequest,
  { params }: { params: { appointmentId: string } }
) {
  try {
    const { token, userEmail } = await getAuthenticatedUser();

    const appointmentId = params.appointmentId as Id<"appointments">;
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 100;

    const attempts = await fetchQuery(api.reminders.getReminderAttemptsForAppointment, {
      userEmail,
      appointmentId,
      limit,
    }, { token });

    return NextResponse.json({ appointmentId, attempts });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
