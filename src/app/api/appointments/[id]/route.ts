import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { sendCancelWebhook } from '@/lib/webhook-utils';
import { recordCancellationSmsAttempt } from '@/lib/appointments-integration';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/appointments/[id] - Get appointment details (authenticated)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'appointments.get',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const userEmail = claims.email;
      const appointmentId = params.id as Id<"appointments">;
      extendContext({ userEmail, appointmentId });

      log.info('Fetching appointment details');

      // Get user to find their teamId (enforce multi-tenancy)
      const userInfo = await convex.query(api.users.getUserWithTeam, {
        userEmail,
      });

      if (!userInfo?.teamId) {
        log.warn('User or team not found');
        return NextResponse.json({ error: 'User or team not found' }, { status: 404 });
      }
      extendContext({ teamId: userInfo.teamId as string });

      const appointment = await convex.query(api.appointments.getById, {
        appointmentId,
      });

      if (!appointment || appointment.teamId !== (userInfo.teamId as Id<"teams">)) {
        log.warn('Appointment not found or access denied');
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      extendContext({ patientId: appointment.patientId as string });

      const patient = await convex.query(api.patients.getById, {
        patientId: appointment.patientId,
      });

      const appointmentStatus = (appointment as Record<string, unknown>).status;
      log.info('Appointment details fetched', { 
        hasPatient: !!patient,
        status: typeof appointmentStatus === 'string' ? appointmentStatus : 'scheduled',
      });
      return NextResponse.json({
        appointment: {
          _id: appointment._id,
          dateTime: appointment.dateTime,
          notes: appointment.notes || null,
          patientId: appointment.patientId,
          teamId: appointment.teamId,
          status: (appointment as Record<string, unknown>).status || "scheduled",
          cancelledAt: (appointment as Record<string, unknown>).cancelledAt || null,
        },
        patient: patient
          ? { _id: patient._id, name: patient.name || null, phone: patient.phone }
          : null,
      });
    } catch (error) {
      log.error('Failed to fetch appointment', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// DELETE /api/appointments/[id] - Cancel appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'DELETE',
    route: 'appointments.cancel',
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

      const userEmail = claims.email; // 🔑 Server-controlled user identity
      const appointmentId = params.id as Id<"appointments">;
      extendContext({ userEmail, appointmentId });

      log.info('Canceling appointment');

      // Get appointment details before canceling (for webhook)
      const appointment = await convex.query(api.appointments.getById, {
        appointmentId,
      });

      if (!appointment) {
        log.warn('Appointment not found');
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      extendContext({ 
        teamId: appointment.teamId as string, 
        patientId: appointment.patientId as string 
      });

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

      log.info('Appointment canceled');
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error('Failed to cancel appointment', error);
      return NextResponse.json({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }, { status: 500 });
    }
  });
}
