import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { sendCancelWebhook } from '@/lib/webhook-utils';
import { logAuthFailure, createLogger } from '../../../../../convex/logger';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// DELETE /api/appointments/[id] - Cancel appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      logAuthFailure("Not authenticated or missing email", undefined, { operation: "DELETE /api/appointments/[id]" }, "vercel");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email; // 🔑 Server-controlled user identity
    const appointmentId = params.id as Id<"appointments">;

    const logger = createLogger({ operation: "DELETE /api/appointments/[id]", userEmail, appointmentId }, "vercel");
    logger.debug("Canceling appointment");

    // Get appointment details before canceling (for webhook)
    const appointment = await convex.query(api.appointments.getById, {
      appointmentId,
    });

    if (!appointment) {
      logger.warn("Appointment not found", { appointmentId });
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

    const cancelLogger = createLogger({ operation: "DELETE /api/appointments/[id]", userEmail, appointmentId }, "vercel");
    cancelLogger.info("Appointment canceled", {
      appointmentId,
      patientId: appointment.patientId,
      teamId: appointment.teamId,
    });

    // 🔗 Send cancel webhook after successful cancellation
    if (patient) {
      await sendCancelWebhook(
        convex,
        appointmentId,
        appointment.patientId,
        patient.phone,
        patient.name || null,
        appointment.dateTime
      );
    } else {
      logger.warn("Patient not found for canceled appointment", {
        appointmentId,
        patientId: appointment.patientId,
      });
    }

    logger.info("Appointment canceled successfully", { appointmentId });
    return NextResponse.json({ success: true });
  } catch (error) {
    const logger = createLogger({ operation: "DELETE /api/appointments/[id]" }, "vercel");
    logger.error("Error canceling appointment", {}, error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
