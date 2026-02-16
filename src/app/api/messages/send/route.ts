/**
 * Send SMS Message API
 * 
 * Sends an SMS message to a patient and logs it to the messages table.
 * Used by the dashboard for two-way SMS conversations.
 * 
 * POST /api/messages/send
 * Body: { patientId, body, templateId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { api } from '../../../../../convex/_generated/api';
import { internal } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { getSMSProviderForTeam, getDefaultSMSProvider, resolveTemplatePlaceholders, type MessageContext } from '@/lib/sms';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';
import { formatAppointmentDateTime } from '@/lib/webhook-utils';
import { createAdminConvexClient } from '@/lib/convex-server';
import { safeErrorMessage } from '@/lib/api-utils';

const convex = createAdminConvexClient();

export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'messages.send',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      // Auth check
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      // Parse request body
      const body = await request.json();
      const { patientId, body: messageBody, templateId, appointmentId } = body;
      
      if (!patientId || !messageBody) {
        log.warn('Missing required fields');
        return NextResponse.json(
          { error: 'patientId and body are required' },
          { status: 400 }
        );
      }
      
      log.info('Sending SMS message', { patientId });
      
      // Get patient info for template resolution
      const patient = await convex.query(api.patients.getById, { 
        patientId: patientId as Id<'patients'> 
      });
      
      if (!patient) {
        log.warn('Patient not found');
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      
      // Get user and team info
      const userInfo = await convex.query(api.users.getUserWithTeam, { userEmail });
      if (!userInfo || !userInfo.teamId) {
        log.warn('User has no team');
        return NextResponse.json({ error: 'User has no team' }, { status: 400 });
      }
      
      // Verify patient belongs to user's team
      if (patient.teamId !== userInfo.teamId) {
        log.warn('Patient not in user team');
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      
      extendContext({ teamId: userInfo.teamId as string });
      
      // Build message context for template resolution
      const messageContext: MessageContext = {
        patientName: patient.name || undefined,
        patientPhone: patient.phone,
        teamName: userInfo.teamName || undefined,
      };
      
      // If there's an appointment context, add appointment details
      if (appointmentId) {
        const appointment = await convex.query(api.appointments.getById, {
          appointmentId: appointmentId as Id<'appointments'>,
        });
        
        if (appointment) {
          const team = await convex.query(api.teams.getById, {
            teamId: appointment.teamId,
          });
          
          const timezone = team?.timezone || process.env.APPOINTMENT_TIMEZONE || 'America/Los_Angeles';
          const appointmentDate = new Date(appointment.dateTime);
          const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
          
          messageContext.appointmentDate = appointmentDateStr;
          messageContext.appointmentTime = appointmentTimeStr;
          messageContext.hospitalAddress = team?.hospitalAddress || undefined;
        }
      }
      
      // Resolve any template placeholders in the message
      const resolvedBody = resolveTemplatePlaceholders(messageBody, messageContext);
      
      // Create message record (status: pending)
      const createResult = await convex.mutation(api.messages.createOutboundMessage, {
        userEmail,
        patientId: patientId as Id<'patients'>,
        body: resolvedBody,
        templateId: templateId as Id<'messageTemplates'> | undefined,
        appointmentId: appointmentId as Id<'appointments'> | undefined,
      });
      
      const { messageId, phone, teamId } = createResult;
      
      // Get SMS provider for team
      let provider = await getSMSProviderForTeam(convex, teamId as Id<'teams'>);
      
      // Fall back to default provider if team has no config
      if (!provider) {
        log.info('Using default SMS provider');
        provider = getDefaultSMSProvider();
      }
      
      // Send the message
      const sendResult = await provider.sendMessage({
        to: phone,
        body: resolvedBody,
      });
      
      // Update message status
      await convex.mutation(internal.messages.updateMessageStatus, {
        messageId: messageId as Id<'messages'>,
        status: sendResult.success ? 'sent' : 'failed',
        providerMessageId: sendResult.messageId,
        errorMessage: sendResult.error,
      });
      
      if (!sendResult.success) {
        log.warn('SMS send failed', { error: sendResult.error });
        return NextResponse.json({
          ok: false,
          messageId,
          error: sendResult.error || 'Failed to send SMS',
        }, { status: 500 });
      }
      
      log.info('SMS sent successfully', { messageId, providerMessageId: sendResult.messageId });
      
      return NextResponse.json({
        ok: true,
        messageId,
        providerMessageId: sendResult.messageId,
      });
    } catch (error) {
      log.error('Error sending SMS', error);
      return NextResponse.json(
        { error: safeErrorMessage(error, 'Internal server error') },
        { status: 500 }
      );
    }
  });
}

