import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// DELETE /api/appointments/[id] - Cancel appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email; // 🔑 Server-controlled user identity
    const appointmentId = params.id as Id<"appointments">;

    console.log('API: Canceling appointment for user:', userEmail);

    // 🔒 Server calls Convex with validated user email
    await convex.mutation(api.appointments.cancel, {
      id: appointmentId,
      userEmail, // 🛡️ Server provides the real user email
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error canceling appointment:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
