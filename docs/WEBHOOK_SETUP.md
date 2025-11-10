# Webhook Setup Guide

## Overview

When a new appointment is created, the system sends a POST request to a configured webhook URL with patient response links. Patients can click these links to notify the provider about their status (running late, need to reschedule, etc.).

## Environment Variables

Add the following to your `.env.local` file:

```bash
# Schedule Webhook URL - Required
# This endpoint will receive POST requests when appointments are created
SCHEDULE_WEBHOOK_URL=https://your-webhook-endpoint.com/webhook

# Base URL - Required for webhook payload URLs
# Should match your deployed application URL
NEXT_PUBLIC_BASE_URL=https://your-app-domain.com
```

## Webhook Payload Format

When a new appointment is created, a POST request is sent to `SCHEDULE_WEBHOOK_URL` with the following JSON payload:

```json
{
  "15 min late": "https://your-app-domain.com/15-late/[appointmentId]",
  "30 min late": "https://your-app-domain.com/30-late/[appointmentId]",
  "Reschedule or cancel": "https://your-app-domain.com/reschedule-cancel/[appointmentId]"
}
```

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

## Notes

- Patient response pages are **public** (no authentication required)
- Webhook failures do not prevent appointment creation
- All webhook errors are logged to the console
- If `SCHEDULE_WEBHOOK_URL` is not set, webhooks are skipped silently

