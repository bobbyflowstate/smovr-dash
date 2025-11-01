import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { extractDisplayName } from '@/lib/auth-utils';

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

    // 🔒 Ensure user exists first
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userEmail,
      name: userName,
      logtoUserId,
    });

    // 🔒 Then create appointment
    const result = await convex.mutation(api.patients.scheduleAppointment, {
      phone: body.phone,
      name: body.name,
      notes: body.notes,
      appointmentDateTime: body.appointmentDateTime,
      metadata: body.metadata, // Optional JSON metadata
      userEmail, // 🛡️ Server provides the real user email
    });

    // Get team name for response
    const userInfo = await convex.query(api.users.getUserWithTeam, { 
      userEmail 
    });

    // 🔗 Send webhook if new appointment was created
    if (result.newAppointment && result.appointmentId) {
      const webhookUrl = process.env.WEBHOOK_URL;
      
      if (webhookUrl) {
        // Create abort controller for 5 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const appointmentId = result.appointmentId;
          
          const webhookPayload = {
            "15 min late": `${baseUrl}/15-late/${appointmentId}`,
            "30 min late": `${baseUrl}/30-late/${appointmentId}`,
            "Reschedule or cancel": `${baseUrl}/reschedule-cancel/${appointmentId}`
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
        console.log('WEBHOOK_URL not configured, skipping webhook');
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
