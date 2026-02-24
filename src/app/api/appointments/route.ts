import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';
import { internal } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  convertComponentsToTimezoneUTC,
} from '@/lib/timezone-utils';
import { sendScheduleWebhook } from '@/lib/webhook-utils';
import {
  fetchAppointmentsWithFilter,
  recordBookingConfirmationAndMaybeSuppress,
} from '@/lib/appointments-integration';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';
import { createAdminConvexClient } from '@/lib/convex-server';

// GET /api/appointments - Get user's appointments
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'appointments.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    const convex = createAdminConvexClient();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const currentUser = await fetchQuery(api.users.currentUser, {}, { token });
      const userEmail = currentUser?.userEmail || "";
      extendContext({ userEmail });
      
      log.info('Fetching appointments');

      const { searchParams } = new URL(request.url);
      const includeCancelled = searchParams.get('includeCancelled') === '1';

      const result = await fetchAppointmentsWithFilter({
        convex,
        api,
        userEmail,
        includeCancelled,
      });

      log.info('Appointments fetched', { count: result.length });
      return NextResponse.json(result);
    } catch (error) {
      log.error('Failed to fetch appointments', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

// POST /api/appointments - Create new appointment
export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'appointments.create',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    const convex = createAdminConvexClient();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json();

      log.info('Creating appointment', { phone: body.phone });

    await fetchMutation(api.users.ensureTeam, {}, { token });

    const userInfo = await fetchQuery(api.users.currentUser, {}, { token });
    const userEmail = userInfo?.userEmail || "";
    extendContext({ userEmail });
    if (userInfo?.teamId) {
      extendContext({ teamId: userInfo.teamId as string });
    }
    const team = userInfo?.teamId
      ? await fetchQuery(api.teams.getById, { teamId: userInfo.teamId as Id<"teams"> }, { token })
      : null;
    const teamTimezone =
      team?.timezone || process.env.APPOINTMENT_TIMEZONE || 'America/Los_Angeles';

    // Convert appointment time to configured timezone
    // User submits local time components, which we reinterpret as being in the configured timezone
    // This ensures appointments are stored correctly regardless of user's timezone
    let timezoneConvertedDateTime: string;
    
    if (body.appointmentDateTimeLocal) {
      // Use local time components from client (preferred - more accurate)
      const { year, month, day, hour, minute, second } = body.appointmentDateTimeLocal;
      timezoneConvertedDateTime = convertComponentsToTimezoneUTC(
        year,
        month,
        day,
        hour,
        minute,
        second || 0,
        teamTimezone
      );
    } else {
      // Fallback: extract from UTC ISO string (less accurate, but backward compatible)
      const clientTime = new Date(body.appointmentDateTime);
      const year = clientTime.getUTCFullYear();
      const month = clientTime.getUTCMonth();
      const day = clientTime.getUTCDate();
      const hour = clientTime.getUTCHours();
      const minute = clientTime.getUTCMinutes();
      const second = clientTime.getUTCSeconds();
      
      timezoneConvertedDateTime = convertComponentsToTimezoneUTC(
        year,
        month,
        day,
        hour,
        minute,
        second,
        teamTimezone
      );
    }

    // Check for existing future appointments for this patient (unless user has confirmed cancellation)
    if (!body.skipExistingCheck) {
      const existingAppointment = await fetchQuery(api.appointments.getExistingForPatient, {
        phone: body.phone,
        userEmail: "",
      }, { token });

      if (existingAppointment) {
        // Return existing appointment info for frontend confirmation
        return NextResponse.json({
          requiresConfirmation: true,
          existingAppointment: {
            id: existingAppointment._id,
            dateTime: existingAppointment.dateTime,
            patient: {
              name: existingAppointment.patient?.name || null,
              phone: existingAppointment.patient?.phone || body.phone,
            },
          },
          newAppointmentDateTime: timezoneConvertedDateTime,
        });
      }
    }

    // 🔒 Then create appointment with timezone-converted datetime
    const result = await fetchMutation(api.patients.scheduleAppointment, {
      phone: body.phone,
      name: body.name,
      notes: body.notes,
      appointmentDateTime: timezoneConvertedDateTime,
      metadata: body.metadata,
      userEmail: "",
    }, { token });

    // userInfo already loaded above

    // 🔗 Send webhook if new appointment was created
    if (result.newAppointment && result.appointmentId && result.patientId) {
      await recordBookingConfirmationAndMaybeSuppress({
        convex,
        api,
        internalApi: internal,
        userEmail,
        appointmentId: result.appointmentId as Id<"appointments">,
        patientId: result.patientId as Id<"patients">,
        teamId: result.teamId ? (result.teamId as Id<"teams">) : null,
        appointmentDateTime: timezoneConvertedDateTime,
        phone: body.phone,
        name: body.name || null,
        sendScheduleWebhook,
      });
    }

      log.info('Appointment created', { appointmentId: result.appointmentId });
      return NextResponse.json({
        ...result,
        teamName: userInfo?.teamName || "Unknown Team"
      });
    } catch (error) {
      log.error('Failed to create appointment', error);
      return NextResponse.json({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }, { status: 500 });
    }
  });
}
