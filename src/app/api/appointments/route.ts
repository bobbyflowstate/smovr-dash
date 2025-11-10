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
  formatInTimezone,
} from '@/lib/timezone-utils';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Medical Center Drive, Suite 456, San Francisco, CA 94102';

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
    if (result.newAppointment && result.appointmentId) {
      const webhookUrl = process.env.SCHEDULE_WEBHOOK_URL;
      
      if (webhookUrl) {
        // Create abort controller for 5 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const appointmentId = result.appointmentId;
          
          // Get appointment and patient details for webhook payload
          const appointment = await convex.query(api.appointments.getById, {
            appointmentId: appointmentId as Id<"appointments">
          });

          if (!appointment) {
            console.error('Appointment not found for webhook:', appointmentId);
            clearTimeout(timeoutId);
            return;
          }

          const patient = await convex.query(api.patients.getById, {
            patientId: appointment.patientId
          });

          // Parse appointment date/time
          const appointmentDate = new Date(appointment.dateTime);
          
          // Format date prettier: "January 15, 2024"
          const appointmentDateStr = formatInTimezone(appointmentDate, APPOINTMENT_TIMEZONE, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          
          // Format time in timezone: "2:30 PM" (hours and minutes only)
          const appointmentTimeStr = formatInTimezone(appointmentDate, APPOINTMENT_TIMEZONE, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });

          // Format datetime in timezone: "12-21-2021 08:30 AM" (MM-DD-YYYY HH:MM A)
          // Get date parts directly in configured timezone using Intl.DateTimeFormat
          const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: APPOINTMENT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          
          const parts = timezoneFormatter.formatToParts(appointmentDate);
          const month = parts.find(p => p.type === 'month')?.value || '';
          const day = parts.find(p => p.type === 'day')?.value || '';
          const year = parts.find(p => p.type === 'year')?.value || '';
          const hour = parts.find(p => p.type === 'hour')?.value || '';
          const minute = parts.find(p => p.type === 'minute')?.value || '';
          const ampm = parts.find(p => p.type === 'dayPeriod')?.value || '';
          
          const appointmentDateTimeStr = `${month}-${day}-${year} ${hour}:${minute} ${ampm}`;
          
          // Get patient name - use null if not found (not "Unknown")
          const patientName = patient?.name || body.name || null;
          
          const webhookPayload = {
            appointment_id: appointmentId,
            patient_name: patientName,
            patient_phone: body.phone,
            appointment_date: appointmentDateStr,
            appointment_time: appointmentTimeStr,
            appointment_datetime: appointmentDateTimeStr,
            hospital_address: HOSPITAL_ADDRESS,
            response_urls: {
              "15_min_late": `${baseUrl}/15-late/${appointmentId}`,
              "30_min_late": `${baseUrl}/30-late/${appointmentId}`,
              "reschedule_cancel": `${baseUrl}/reschedule-cancel/${appointmentId}`
            }
          };

          console.log('Sending webhook to:', webhookUrl);
          console.log('Webhook payload:', webhookPayload);

          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookPayload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (webhookResponse.ok) {
            console.log('Webhook sent successfully');
          } else {
            console.error('Webhook failed with status:', webhookResponse.status);
          }
        } catch (webhookError) {
          clearTimeout(timeoutId);
          if (webhookError instanceof Error && webhookError.name === 'AbortError') {
            console.error('Webhook request timed out after 5 seconds');
          } else {
            console.error('Error sending webhook:', webhookError);
          }
          // Don't fail the appointment creation if webhook fails
        }
      } else {
        console.log('SCHEDULE_WEBHOOK_URL not configured, skipping webhook');
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
