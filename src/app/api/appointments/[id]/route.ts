import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { sendCancelWebhook } from '@/lib/webhook-utils';
import { recordCancellationSmsAttempt } from '@/lib/appointments-integration';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/appointments/[id] - Get appointment details (authenticated)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email;
    const appointmentId = params.id as Id<"appointments">;

    // Get user to find their teamId (enforce multi-tenancy)
    const userInfo = await convex.query(api.users.getUserWithTeam, {
      userEmail,
    });

    if (!userInfo?.teamId) {
      return NextResponse.json({ error: 'User or team not found' }, { status: 404 });
    }

    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment || appointment.teamId !== (userInfo.teamId as Id<"teams">)) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const patient = await convex.query(api.patients.getById, {
      patientId: appointment.patientId,
    });

    return NextResponse.json({
      appointment: {
        _id: appointment._id,
        dateTime: appointment.dateTime,
        notes: appointment.notes || null,
        patientId: appointment.patientId,
        teamId: appointment.teamId,
        status: (appointment as any).status || "scheduled",
        cancelledAt: (appointment as any).cancelledAt || null,
      },
      patient: patient
        ? { _id: patient._id, name: patient.name || null, phone: patient.phone }
        : null,
    });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    // Get appointment details before canceling (for webhook)
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Get patient details for webhook
    const patient = await convex.query(api.patients.getById, {
      patientId: appointment.patientId,
    });

    // 🔒 Server calls Convex with validated user email
    await convex.mutation(api.appointments.cancel, {
      id: appointmentId,
      userEmail, // 🛡️ Server provides the real user email
    });

    // 🔗 Send cancel webhook after successful cancellation
    if (patient) {
      await recordCancellationSmsAttempt({
        convex,
        api,
        userEmail,
        appointmentId,
        patientId: appointment.patientId,
        appointmentDateTime: appointment.dateTime,
        patientPhone: patient.phone,
        patientName: patient.name || null,
        sendCancelWebhook,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error canceling appointment:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
