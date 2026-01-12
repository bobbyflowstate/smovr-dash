# Webhook Setup Guide

## Overview

The system sends POST requests to a single unified webhook URL for all SMS notifications (appointment confirmations, cancellations, and reminders). The webhook receives a simple payload with the phone number and pre-formatted message text, allowing GoHighLevel workflows to handle SMS sending.

## Environment Variables

Add the following to your `.env.local` file:

```bash
# Unified SMS Webhook URL - Required
# This endpoint will receive POST requests for all SMS notifications
# (appointments, cancellations, and reminders)
GHL_SMS_WEBHOOK_URL=https://your-webhook-endpoint.com/sms-webhook

# Base URL - Required for SMS message links
# Should match your deployed application URL
# NOTE: This must also be set in Convex dashboard as BASE_URL (without NEXT_PUBLIC_ prefix)
# Convex reminder webhooks run in a separate environment and need BASE_URL set there
NEXT_PUBLIC_BASE_URL=https://your-app-domain.com

# Quiet Hours - Optional
# Prevents reminders from being sent during specified hours (0-23, 24-hour format)
# Example: SMS_QUIET_HOURS_START=22 (10 PM) and SMS_QUIET_HOURS_END=8 (8 AM) 
# would prevent reminders between 10 PM and 8 AM
# If not set, reminders will be sent at any time
SMS_QUIET_HOURS_START=22
SMS_QUIET_HOURS_END=8

# Default Team Contact Phone - Optional (but recommended)
# Used on public patient landing pages (e.g. reschedule/cancel and "appointment passed")
# If not set, the UI will avoid showing a misleading hard-coded number.
DEFAULT_TEAM_CONTACT_PHONE=+14155550123

# Appointment Timezone - Optional
# IANA timezone string for appointment scheduling (defaults to America/Los_Angeles)
APPOINTMENT_TIMEZONE=America/Los_Angeles

# Hospital Address - Optional
# Address included in SMS messages (defaults to example address)
HOSPITAL_ADDRESS=123 Medical Center Drive, Suite 456, San Francisco, CA 94102
```

## Webhook Payload Format

All webhook requests use the same simple payload format:

```json
{
  "phone": "+15551234567",
  "message": "Hi John! Your appointment is scheduled for January 15, 2024 at 2:30 PM at 123 Medical Center Drive, Suite 456, San Francisco, CA 94102. If you're running late or need to reschedule, use these links: 15 min late: https://your-app-domain.com/15-late/k123abc456def | 30 min late: https://your-app-domain.com/30-late/k123abc456def | Reschedule/Cancel: https://your-app-domain.com/reschedule-cancel/k123abc456def"
}
```

### Message Types

The system sends different message types based on the event:

1. **Schedule Confirmation**: Sent when a new appointment is created
   - Example: "Hi [Name]! Your appointment is scheduled for [Date] at [Time]. If you're running late or need to reschedule, use these links: ..."

2. **Cancellation Notification**: Sent when an appointment is canceled
   - Example: "Hi [Name], your appointment on [Date] at [Time] has been canceled. If you need to reschedule, please contact us."

3. **24h Reminder**: Sent 24 hours before appointment
   - Example: "Hi [Name], reminder: You have an appointment tomorrow ([Date]) at [Time]. If you're running late or need to reschedule, use these links: ..."

4. **1h Reminder**: Sent 1 hour before appointment
   - Example: "Hi [Name], reminder: You have an appointment today at [Time] ([Date]). If you're running late or need to reschedule, use these links: ..."

## Patient Response Pages

Three public pages handle patient responses:

1. **`/15-late/[appointmentId]`** - Patient running 15 minutes late
   - Displays: "No worries! We'll be waiting for you."
   - Logs action to dashboard

2. **`/30-late/[appointmentId]`** - Patient running 30 minutes late
   - Displays: "No worries! We'll be waiting for you."
   - Logs action to dashboard

3. **`/reschedule-cancel/[appointmentId]`** - Patient needs to reschedule/cancel
   - Displays the clinic/team contact phone (configured via `DEFAULT_TEAM_CONTACT_PHONE` or per-team `teams.contactPhone`)
   - Logs action to dashboard

## Logs Dashboard

All patient actions are logged and visible in the `/logs` dashboard page:

- **Timestamp** - When the patient responded
- **Patient Phone** - Patient's phone number
- **Appointment** - Scheduled appointment date/time
- **Action** - What action the patient took
- **Message** - Human-readable description

Logs are automatically filtered by team - users only see logs for appointments in their team.

## Testing

To test the webhook integration:

1. Set `GHL_SMS_WEBHOOK_URL` in your `.env.local` (and `GHL_SMS_WEBHOOK_URL` in Convex dashboard)
2. Create a new appointment via the Submit form
3. Check your webhook endpoint to verify it received the payload with `phone` and `message` fields
4. Visit one of the patient response URLs
5. Check the `/logs` page to verify the action was logged

## Single Appointment Per Patient

The system enforces a one-appointment-per-patient policy (based on phone number). When scheduling a new appointment for a patient who already has a future appointment:

1. The system detects the existing appointment
2. A confirmation dialog is shown to the user displaying:
   - The existing appointment details (patient name, phone, date/time)
   - The new appointment details
3. If the user confirms:
   - The existing appointment is canceled (triggers cancel webhook)
   - The new appointment is scheduled (triggers schedule webhook)
4. If the user cancels, no changes are made

This ensures that each patient can only have one active appointment at a time, preventing scheduling conflicts.

## Reminder Webhooks

The system can send reminder webhooks 24 hours and 1 hour before appointments. These use the same unified webhook URL and payload format as other notifications, but with reminder-specific message text.

### Reminder Timing

- **24-hour reminder**: Sent when appointment is between 23-25 hours away (wider window to account for cron timing)
- **1-hour reminder**: Sent when appointment is between 0.5-2 hours away (wider window to account for cron timing)

Reminders are checked every hour via cron job. The wider windows ensure reminders aren't missed due to timing variations.

### Quiet Hours

If `SMS_QUIET_HOURS_START` and `SMS_QUIET_HOURS_END` are configured, reminder webhooks will not be sent during those hours. This prevents sending reminders at inappropriate times (e.g., late at night).

- Values must be between 0-23 (24-hour format)
- Quiet hours can span midnight (e.g., 22-8 means 10 PM to 8 AM)
- **Important**: If invalid values are provided (outside 0-23 range), reminder checks will be skipped entirely and no reminders will be sent until the configuration is fixed

## Convex Environment Variables

**IMPORTANT**: Reminder webhooks run in Convex cron jobs, which have a separate environment from Next.js. You must set the following environment variables in your **Convex dashboard**:

1. Go to your Convex dashboard → Settings → Environment Variables
2. Add the following variables:

```bash
# Unified SMS Webhook URL - REQUIRED
# This endpoint will receive POST requests for all SMS notifications
GHL_SMS_WEBHOOK_URL=https://your-webhook-endpoint.com/sms-webhook

# Base URL - REQUIRED for SMS notification links
# This must match your production domain (e.g., https://your-app-domain.com)
# Without this, users will receive localhost links in SMS notifications!
BASE_URL=https://your-app-domain.com

# Optional: Quiet hours and timezone
SMS_QUIET_HOURS_START=22
SMS_QUIET_HOURS_END=8
APPOINTMENT_TIMEZONE=America/Los_Angeles
HOSPITAL_ADDRESS=123 Medical Center Drive, Suite 456, San Francisco, CA 94102
```

**Critical**: 
- If `GHL_SMS_WEBHOOK_URL` is not set, SMS webhooks will be skipped silently
- If `BASE_URL` is not set in Convex, reminder webhooks will fail with an error and no SMS notifications will be sent. This prevents accidentally sending localhost links to users.

## Notes

- Patient response pages are **public** (no authentication required)
- Webhook failures do not prevent appointment creation or cancellation
- All webhook errors are logged to the console
- If `GHL_SMS_WEBHOOK_URL` is not set, all SMS webhooks are skipped silently
- **If `BASE_URL` is not set in Convex dashboard, reminder webhooks will fail** - this prevents sending localhost links
- Webhook requests have a 10-second timeout
- Only future appointments are considered when checking for existing appointments
- Reminder webhooks are sent via hourly cron jobs, not immediately when appointments are created
- All messages are pre-formatted in the application code - the webhook receives ready-to-send SMS text
- GoHighLevel workflows should extract the `phone` and `message` fields and send the SMS directly

