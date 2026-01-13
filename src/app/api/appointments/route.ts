import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractDisplayName } from '@/lib/auth-utils';
import {
  APPOINTMENT_TIMEZONE,
  convertComponentsToTimezoneUTC,
} from '@/lib/timezone-utils';
import { sendScheduleWebhook } from '@/lib/webhook-utils';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/appointments - Get user's appointments
export async function GET() {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email; // 🔑 Server-controlled user identity
    
    console.log('API: Getting appointments for user:', userEmail);

    // 🔒 Server calls Convex with validated user email
    const result = await convex.query(api.appointments.get, { 
      userEmail 
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/appointments - Create new appointment
export async function POST(request: NextRequest) {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email; // 🔑 Server-controlled user identity
    const userName = extractDisplayName(claims);
    const logtoUserId = claims.sub;
    const body = await request.json();

    console.log('API: Creating appointment for user:', userEmail);

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
        APPOINTMENT_TIMEZONE
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
        APPOINTMENT_TIMEZONE
      );
    }

    // 🔒 Ensure user exists first
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userEmail,
      name: userName,
      logtoUserId,
    });

    // Check for existing future appointments for this patient (unless user has confirmed cancellation)
    if (!body.skipExistingCheck) {
      const existingAppointment = await convex.query(api.appointments.getExistingForPatient, {
        phone: body.phone,
        userEmail,
      });

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
    const result = await convex.mutation(api.patients.scheduleAppointment, {
      phone: body.phone,
      name: body.name,
      notes: body.notes,
      appointmentDateTime: timezoneConvertedDateTime,
      metadata: body.metadata, // Optional JSON metadata
      userEmail, // 🛡️ Server provides the real user email
    });

    // Get team name for response
    const userInfo = await convex.query(api.users.getUserWithTeam, { 
      userEmail 
    });

    // 🔗 Send webhook if new appointment was created
    if (result.newAppointment && result.appointmentId && result.patientId) {
      const scheduleWebhookSent = await sendScheduleWebhook(
        convex,
        result.appointmentId as Id<"appointments">,
        result.patientId as Id<"patients">,
        body.phone,
        body.name || null
      );

      // If booked within the 24h reminder window, mark the 24h reminder as "sent"
      // This prevents double-notification (confirmation + 24h reminder)
      // IMPORTANT: Only do this if the schedule webhook actually succeeded.
      // Otherwise we'd suppress the 24h reminder even though no SMS was delivered.
      if (result.teamId && scheduleWebhookSent) {
        await convex.mutation(api.reminders.markReminderSentIfInWindow, {
          appointmentId: result.appointmentId as Id<"appointments">,
          patientId: result.patientId as Id<"patients">,
          appointmentDateTime: timezoneConvertedDateTime,
          teamId: result.teamId as Id<"teams">,
        });
      }
    }

    return NextResponse.json({
      ...result,
      teamName: userInfo?.teamName || "Unknown Team"
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
