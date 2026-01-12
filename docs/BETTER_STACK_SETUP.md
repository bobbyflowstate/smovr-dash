# Better Stack (Logtail) Setup Guide

## Overview

This guide walks you through setting up **code-based log forwarding** from both **Convex** and **Vercel/Next.js** to Better Stack (Logtail). This approach is **free** and doesn't require Vercel Pro plan.

## Step 1: Get Better Stack Credentials

1. In Better Stack dashboard, go to **Sources** → **Add Source**
2. Choose **Token-based** or **HTTP endpoint** (recommended: HTTP endpoint)
3. Copy the **endpoint URL** and **Bearer token**

The endpoint will look like:
```
https://s1672698.eu-nbg-2.betterstackdata.com
```

And you'll get a Bearer token (e.g., `J7xCwcZ8vt3J7SxSawXNE9ya`)

## Step 2: Configure Environment Variables

### For Convex (Backend Logs)

Set both the endpoint URL and token:

```bash
npx convex env set BETTER_STACK_LOGTAIL_URL "https://s1672698.eu-nbg-2.betterstackdata.com"
npx convex env set BETTER_STACK_LOGTAIL_TOKEN "YOUR_TOKEN"
```

Or in Convex Dashboard → **Settings** → **Environment Variables**, add:
- `BETTER_STACK_LOGTAIL_URL` = `https://s1672698.eu-nbg-2.betterstackdata.com`
- `BETTER_STACK_LOGTAIL_TOKEN` = `YOUR_TOKEN`

### For Vercel/Next.js (API Route Logs)

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add:
   ```
   BETTER_STACK_LOGTAIL_URL=https://s1672698.eu-nbg-2.betterstackdata.com
   BETTER_STACK_LOGTAIL_TOKEN=YOUR_TOKEN
   ```
3. Make sure to add it to **Production**, **Preview**, and **Development** environments if you want logs from all environments

**For local development**, add to `.env.local`:
```
BETTER_STACK_LOGTAIL_URL=https://s1672698.eu-nbg-2.betterstackdata.com
BETTER_STACK_LOGTAIL_TOKEN=YOUR_TOKEN
```

## Step 3: Verify Setup

The code-based forwarding is already implemented! All structured logs will automatically forward to Better Stack.

### Test Convex Logging

**Option 1: Use Test Function (Easiest)**

1. Make sure both `BETTER_STACK_LOGTAIL_URL` and `BETTER_STACK_LOGTAIL_TOKEN` are set:
   ```bash
   npx convex env set BETTER_STACK_LOGTAIL_URL "https://s1672698.eu-nbg-2.betterstackdata.com"
   npx convex env set BETTER_STACK_LOGTAIL_TOKEN "YOUR_TOKEN"
   ```

2. Run the test function:
   ```bash
   npx convex run debug_logging:testBetterStack
   ```
   Or in Convex Dashboard: Functions → `debug_logging` → `testBetterStack` → Run

3. Check Better Stack dashboard in a few seconds - you should see test logs with `source: "convex"` and `debugTest: true`

**Option 2: Create an Appointment**

1. Start your dev server: `npm run dev`
2. Create an appointment through the UI
3. Check Better Stack dashboard - you should see logs with `source: "convex"` from appointment creation

### Test Next.js/Vercel Logging

**Option 1: Use API Routes**

1. Make sure both variables are in your `.env.local`:
   ```bash
   BETTER_STACK_LOGTAIL_URL=https://s1672698.eu-nbg-2.betterstackdata.com
   BETTER_STACK_LOGTAIL_TOKEN=YOUR_TOKEN
   ```

2. Start your dev server:
   ```bash
   npm run dev
   ```

3. Make a request to your API:
   ```bash
   # Get appointments (requires auth)
   curl http://localhost:3000/api/appointments
   
   # Or just visit http://localhost:3000/api/appointments in your browser
   ```

4. Check Better Stack dashboard - you should see logs with `source: "vercel"`

**Option 2: Create an Appointment via API**

1. Create an appointment through the UI (which calls `/api/appointments`)
2. Check Better Stack dashboard - you should see logs from the API route

## Step 4: Configure Slack Alerts (Optional)

1. In Better Stack dashboard, go to **Alerts** → **Create Alert**
2. Set up alerts for:
   - **Error rate > 5%** in 5 minutes
   - **Webhook failures** (message contains "webhook failed")
   - **Cron job failures** (message contains "Cron job error")
   - **Configuration errors** (message contains "Configuration error")
3. Connect to Slack (you already selected this during setup)

## How It Works

### Structured Logging

All logs are structured JSON with:
- `level`: "info" | "warn" | "error" | "debug"
- `message`: Human-readable message
- `context`: Additional metadata (userId, teamId, appointmentId, etc.)
- `timestamp`: ISO timestamp
- `source`: "convex" or "vercel"
- `error`: Error details (if applicable)

### Automatic Forwarding

- Logs are sent to Better Stack **asynchronously** (non-blocking)
- Forwarding failures are **silently handled** (won't break your app)
- 5-second timeout prevents hanging requests
- Works for both Convex and Next.js

### Privacy

- Phone numbers are partially masked: `***-***-1234`
- Email addresses are partially masked: `us***@example.com`
- Sensitive data is not logged in full

## Log Sources

### Convex Logs (`source: "convex"`)
- Reminder cron jobs
- Webhook operations
- Appointment operations
- Database operations
- Configuration errors

### Vercel/Next.js Logs (`source: "vercel"`)
- API route requests/responses
- Authentication/authorization
- Error handling
- Server-side operations

## Filtering Logs in Better Stack

You can filter logs by:
- **Source**: `source:convex` or `source:vercel`
- **Level**: `level:error` or `level:warn`
- **Operation**: `operation:"GET /api/appointments"`
- **Team**: `teamId:"k123abc456def"`
- **Appointment**: `appointmentId:"k123abc456def"`

## Troubleshooting

### Logs not appearing in Better Stack?

1. **Check environment variables**:
   - **Convex**: 
     - CLI: `npx convex env ls` (to list)
     - CLI: `npx convex env set BETTER_STACK_LOGTAIL_URL "https://s1672698.eu-nbg-2.betterstackdata.com"`
     - CLI: `npx convex env set BETTER_STACK_LOGTAIL_TOKEN "YOUR_TOKEN"`
     - Dashboard: Settings → Environment Variables → Check both `BETTER_STACK_LOGTAIL_URL` and `BETTER_STACK_LOGTAIL_TOKEN`
   - **Vercel/Next.js**: 
     - Local: Check `.env.local` file (both variables required)
     - Production: Vercel Dashboard → Settings → Environment Variables (both variables required)

2. **Verify endpoint URL and token**:
   - Endpoint URL should be like `https://s1672698.eu-nbg-2.betterstackdata.com`
   - Token should be set separately in `BETTER_STACK_LOGTAIL_TOKEN`
   - Check for typos or extra spaces
   - Make sure there's no trailing slash on the URL

3. **Test with the test function**:
   ```bash
   # Test Convex logging
   npx convex run debug_logging:testBetterStack
   
   # Check Better Stack dashboard - should see logs within 5-10 seconds
   ```

4. **Check Better Stack dashboard**:
   - Go to Sources → Verify your source is active
   - Check if logs are being received
   - Look for logs with `test: true` if you ran the test function

5. **Check console for errors**:
   - Look for `[Logger] Failed to forward log` messages in your console
   - This indicates the forwarding failed (but won't break your app)

6. **Verify network connectivity**:
   - Convex functions CAN make HTTP requests (actions, mutations, queries)
   - Next.js can make HTTP requests
   - Both should be able to reach your Better Stack endpoint (e.g., `https://s1672698.eu-nbg-2.betterstackdata.com`)
   - The logger uses Bearer token authentication in the Authorization header

### Logs appearing but not structured?

- All logs should be JSON formatted
- If you see plain text, check the logger implementation
- Verify you're using `createLogger()` from the logger utilities

## Cost

- **Free**: Code-based forwarding has no additional cost
- **Better Stack**: Free tier (1GB/month) should be sufficient initially
- **No Vercel Pro required**: This approach bypasses Vercel's log drain requirement

## Next Steps

1. ✅ Set up environment variables (Convex + Vercel)
2. ✅ Test logging (trigger some operations)
3. ✅ Configure alerts in Better Stack
4. ✅ Set up Slack notifications (optional)

You're all set! All critical operations are now being logged and forwarded to Better Stack.
