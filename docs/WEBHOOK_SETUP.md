# Webhook Setup Guide

## Overview

The system sends POST requests to configured webhook URLs when appointments are created or canceled. When a new appointment is created, the webhook includes patient response links that patients can click to notify the provider about their status (running late, need to reschedule, etc.).

## Environment Variables

Add the following to your `.env.local` file:

```bash
# Schedule Webhook URL - Required
# This endpoint will receive POST requests when appointments are created
SCHEDULE_WEBHOOK_URL=https://your-webhook-endpoint.com/webhook

# Cancel Webhook URL - Optional
# This endpoint will receive POST requests when appointments are canceled
# If not set, cancel webhooks will be sent to SCHEDULE_WEBHOOK_URL (if configured)
CANCEL_WEBHOOK_URL=https://your-webhook-endpoint.com/webhook

# Base URL - Required for webhook payload URLs
# Should match your deployed application URL
NEXT_PUBLIC_BASE_URL=https://your-app-domain.com

# Reminder Webhook URLs - Optional
# These endpoints will receive POST requests for appointment reminders
# If not set, reminder webhooks will be skipped silently
WEBHOOK_SMS_REMINDER_24H=https://your-webhook-endpoint.com/reminder-24h
WEBHOOK_SMS_REMINDER_1H=https://your-webhook-endpoint.com/reminder-1h

# Quiet Hours - Optional
# Prevents reminders from being sent during specified hours (0-23, 24-hour format)
# Example: SMS_QUIET_HOURS_START=22 (10 PM) and SMS_QUIET_HOURS_END=8 (8 AM) 
# would prevent reminders between 10 PM and 8 AM
# If not set, reminders will be sent at any time
SMS_QUIET_HOURS_START=22
SMS_QUIET_HOURS_END=8

# Appointment Timezone - Optional
# IANA timezone string for appointment scheduling (defaults to America/Los_Angeles)
APPOINTMENT_TIMEZONE=America/Los_Angeles

# Hospital Address - Optional
# Address included in webhook payloads (defaults to example address)
HOSPITAL_ADDRESS=123 Medical Center Drive, Suite 456, San Francisco, CA 94102
```

## Webhook Payload Format

### Schedule Webhook

When a new appointment is created, a POST request is sent to `SCHEDULE_WEBHOOK_URL` with the following JSON payload:

```json
{
  "appointment_id": "k123abc456def",
  "patient_name": "John Doe",
  "patient_phone": "+15551234567",
  "appointment_date": "January 15, 2024",
  "appointment_time": "2:30 PM",
  "appointment_datetime": "01-15-2024 02:30 PM",
  "hospital_address": "123 Medical Center Drive, Suite 456, San Francisco, CA 94102",
  "response_urls": {
    "15_min_late": "https://your-app-domain.com/15-late/k123abc456def",
    "30_min_late": "https://your-app-domain.com/30-late/k123abc456def",
    "reschedule_cancel": "https://your-app-domain.com/reschedule-cancel/k123abc456def"
  }
}
```

### Cancel Webhook

When an appointment is canceled, a POST request is sent to `CANCEL_WEBHOOK_URL` (or `SCHEDULE_WEBHOOK_URL` if `CANCEL_WEBHOOK_URL` is not set) with the following JSON payload:

```json
{
  "appointment_id": "k123abc456def",
  "patient_name": "John Doe",
  "patient_phone": "+15551234567",
  "appointment_date": "January 15, 2024",
  "appointment_time": "2:30 PM",
  "appointment_datetime": "01-15-2024 02:30 PM",
  "hospital_address": "123 Medical Center Drive, Suite 456, San Francisco, CA 94102",
  "action": "canceled"
}
```

Note: The cancel webhook payload includes an `action` field set to `"canceled"` and does not include `response_urls` since the appointment is no longer active.

## Patient Response Pages

Three public pages handle patient responses:

1. **`/15-late/[appointmentId]`** - Patient running 15 minutes late
   - Displays: "No worries! We'll be waiting for you."
   - Logs action to dashboard

2. **`/30-late/[appointmentId]`** - Patient running 30 minutes late
   - Displays: "No worries! We'll be waiting for you."
   - Logs action to dashboard

3. **`/reschedule-cancel/[appointmentId]`** - Patient needs to reschedule/cancel
   - Displays phone number: **(555) 123-4567**
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

1. Set `SCHEDULE_WEBHOOK_URL` in your `.env.local`
2. Create a new appointment via the Submit form
3. Check your webhook endpoint to verify it received the payload
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

The system can send reminder webhooks 24 hours and 1 hour before appointments. These are separate from the schedule/cancel webhooks and are sent via cron jobs that run every hour.

### Reminder Webhook Payload

Reminder webhooks use the same payload format as schedule webhooks, but include an `action` field:

```json
{
  "appointment_id": "k123abc456def",
  "patient_name": "John Doe",
  "patient_phone": "+15551234567",
  "appointment_date": "January 15, 2024",
  "appointment_time": "2:30 PM",
  "appointment_datetime": "01-15-2024 02:30 PM",
  "hospital_address": "123 Medical Center Drive, Suite 456, San Francisco, CA 94102",
  "action": "reminder_24h",
  "response_urls": {
    "15_min_late": "https://your-app-domain.com/15-late/k123abc456def",
    "30_min_late": "https://your-app-domain.com/30-late/k123abc456def",
    "reschedule_cancel": "https://your-app-domain.com/reschedule-cancel/k123abc456def"
  }
}
```

The `action` field will be either `"reminder_24h"` or `"reminder_1h"` depending on which reminder is being sent.

### Reminder Timing

- **24-hour reminder**: Sent when appointment is between 23-25 hours away (wider window to account for cron timing)
- **1-hour reminder**: Sent when appointment is between 0.5-2 hours away (wider window to account for cron timing)

Reminders are checked every hour via cron job. The wider windows ensure reminders aren't missed due to timing variations.

### Quiet Hours

If `SMS_QUIET_HOURS_START` and `SMS_QUIET_HOURS_END` are configured, reminder webhooks will not be sent during those hours. This prevents sending reminders at inappropriate times (e.g., late at night).

- Values must be between 0-23 (24-hour format)
- Quiet hours can span midnight (e.g., 22-8 means 10 PM to 8 AM)
- **Important**: If invalid values are provided (outside 0-23 range), reminder checks will be skipped entirely and no reminders will be sent until the configuration is fixed

## Notes

- Patient response pages are **public** (no authentication required)
- Webhook failures do not prevent appointment creation or cancellation
- All webhook errors are logged to the console
- If `SCHEDULE_WEBHOOK_URL` is not set, schedule webhooks are skipped silently
- If `CANCEL_WEBHOOK_URL` is not set, cancel webhooks will be sent to `SCHEDULE_WEBHOOK_URL` if configured
- If `WEBHOOK_SMS_REMINDER_24H` or `WEBHOOK_SMS_REMINDER_1H` are not set, reminder webhooks are skipped silently
- Webhook requests have a 10-second timeout
- Only future appointments are considered when checking for existing appointments
- Reminder webhooks are sent via hourly cron jobs, not immediately when appointments are created

