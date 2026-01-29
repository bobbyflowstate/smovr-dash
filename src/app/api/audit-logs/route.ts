/**
 * Audit Logs API
 *
 * These endpoints handle patient action audit logs - recording when patients
 * respond to appointment notifications (e.g., "I'm running 15 minutes late").
 *
 * - GET: Authenticated endpoint for clinic staff to view their team's audit logs
 * - POST: Public endpoint for patients clicking links in SMS notifications
 */

import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { isValidAuditAction, AUDIT_LOG_MESSAGES, type AuditLogAction } from '@/lib/audit-log-actions';
import { APPOINTMENT_TIMEZONE, extractComponentsInTimezone } from '@/lib/timezone-utils';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
const DEFAULT_TEAM_CONTACT_PHONE = process.env.DEFAULT_TEAM_CONTACT_PHONE;

// GET /api/audit-logs - Get audit logs for user's team (authenticated)
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'auditLogs.list',
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

      const userEmail = claims.email;
      extendContext({ userEmail });
      
      log.info('Fetching audit logs');

      // Get user to find their teamId
      const user = await convex.query(api.users.getUserWithTeam, { 
        userEmail 
      });

      if (!user || !user.teamId) {
        log.warn('User or team not found');
        return NextResponse.json({ error: 'User or team not found' }, { status: 404 });
      }

      // 🔒 Get audit logs for user's team only
      const auditLogs = await convex.query(api.audit_logs.getAuditLogsByTeam, { 
        teamId: user.teamId as Id<"teams">
      });

      log.info('Audit logs fetched', { count: auditLogs.length });
      return NextResponse.json(auditLogs);
    } catch (error) {
      log.error('Failed to fetch audit logs', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

// POST /api/audit-logs - Create audit log entry (public - no auth required)
export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'auditLogs.create',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const body = await request.json();
      const { appointmentId, action } = body;
      extendContext({ appointmentId, action });

      // Validate required fields
      if (!appointmentId || !action) {
        log.warn('Missing required fields');
        return NextResponse.json({ error: 'appointmentId and action are required' }, { status: 400 });
      }

      // Validate action is one of the expected values
      if (!isValidAuditAction(action)) {
        log.warn('Invalid action', { action });
        return NextResponse.json({ 
          error: 'Invalid action. Must be one of: 15-late, 30-late, reschedule-cancel' 
        }, { status: 400 });
      }

      log.info('Creating audit log entry');

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
          log.warn('Appointment not found (invalid ID)');
          return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
        }
        // Re-throw other errors (Convex down, etc.) as 500
        throw error;
      }

      if (!appointment) {
        log.warn('Appointment not found');
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
        log.warn('Appointment has passed');
        return NextResponse.json(
          { error: 'Appointment has already passed', contactPhone },
          { status: 410 }
        ); // 410 Gone
      }

      // Get message from constants
      const message = AUDIT_LOG_MESSAGES[action as AuditLogAction];

      // Create audit log entry (will automatically prevent duplicates)
      const auditLogId = await convex.mutation(api.audit_logs.createAuditLog, {
        appointmentId: appointmentId as Id<"appointments">,
        patientId: appointment.patientId,
        action,
        message,
        teamId: appointment.teamId,
      });

      log.info('Audit log entry created', { auditLogId });
      return NextResponse.json({ success: true, logId: auditLogId, contactPhone });
    } catch (error) {
      log.error('Failed to create audit log entry', error);
      return NextResponse.json({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }, { status: 500 });
    }
  });
}

