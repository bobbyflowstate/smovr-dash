import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { isValidAction, LOG_MESSAGES, type LogAction } from '@/lib/log-actions';
import { APPOINTMENT_TIMEZONE, extractComponentsInTimezone } from '@/lib/timezone-utils';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
const DEFAULT_TEAM_CONTACT_PHONE = process.env.DEFAULT_TEAM_CONTACT_PHONE;

// GET /api/logs - Get logs for user's team (authenticated)
export async function GET() {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email;
    
    console.log('API: Getting logs for user:', userEmail);

    // Get user to find their teamId
    const user = await convex.query(api.users.getUserWithTeam, { 
      userEmail 
    });

    if (!user || !user.teamId) {
      return NextResponse.json({ error: 'User or team not found' }, { status: 404 });
    }

    // 🔒 Get logs for user's team only
    const logs = await convex.query(api.logs.getLogsByTeam, { 
      teamId: user.teamId as Id<"teams">
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/logs - Create log entry (public - no auth required)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appointmentId, action } = body;

    // Validate required fields
    if (!appointmentId || !action) {
      return NextResponse.json({ error: 'appointmentId and action are required' }, { status: 400 });
    }

    // Validate action is one of the expected values
    if (!isValidAction(action)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be one of: 15-late, 30-late, reschedule-cancel' 
      }, { status: 400 });
    }

    console.log('API: Creating log for appointment:', appointmentId, 'action:', action);

    // Validate appointment exists and get its data
    let appointment;
    try {
      appointment = await convex.query(api.appointments.getById, {
        appointmentId: appointmentId as Id<"appointments">
      });
    } catch (error) {
      // Handle validation errors (invalid ID format) as 404
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('ArgumentValidationError') || errorMessage.includes('does not match validator')) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      // Re-throw other errors (Convex down, etc.) as 500
      throw error;
    }

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Try to include a contact phone for the clinic/team (used by the public landing pages)
    const team = await convex.query(api.teams.getById, {
      teamId: appointment.teamId,
    });
    const contactPhone = team?.contactPhone || DEFAULT_TEAM_CONTACT_PHONE || null;

    // Check if appointment date has passed (next day or later)
    // We allow late submissions on the same day, even if the appointment time has passed
    // Compare dates in the clinic's timezone, not server's local timezone
    const appointmentDate = new Date(appointment.dateTime); // UTC ISO string
    const now = new Date(); // Current UTC time
    
    // Extract date components in the clinic's timezone for both dates
    const appointmentComponents = extractComponentsInTimezone(appointmentDate, APPOINTMENT_TIMEZONE);
    const todayComponents = extractComponentsInTimezone(now, APPOINTMENT_TIMEZONE);
    
    // Compare dates only (ignore time) - if appointment date is before today in clinic timezone, it's passed
    const appointmentDateOnly = new Date(
      appointmentComponents.year,
      appointmentComponents.month,
      appointmentComponents.day
    );
    const todayDateOnly = new Date(
      todayComponents.year,
      todayComponents.month,
      todayComponents.day
    );
    
    if (appointmentDateOnly < todayDateOnly) {
      return NextResponse.json(
        { error: 'Appointment has already passed', contactPhone },
        { status: 410 }
      ); // 410 Gone
    }

    // Get message from constants
    const message = LOG_MESSAGES[action as LogAction];

    // Create log entry (will automatically prevent duplicates)
    const logId = await convex.mutation(api.logs.createLog, {
      appointmentId: appointmentId as Id<"appointments">,
      patientId: appointment.patientId,
      action,
      message,
      teamId: appointment.teamId,
    });

    return NextResponse.json({ success: true, logId, contactPhone });
  } catch (error) {
    console.error('Error creating log:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}

