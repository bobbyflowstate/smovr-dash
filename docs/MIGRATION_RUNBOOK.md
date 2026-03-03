# Migration Runbook: Logto to Convex Auth

This document covers the remaining operator steps to complete the authentication migration from Logto to Convex Auth with email magic links (Resend). All code changes are already committed; this runbook covers environment setup, data migration, and production cut-over.

## Prerequisites

- Access to the [Convex dashboard](https://dashboard.convex.dev/t/smovr/smovr-dash)
- Access to the **old** Convex deployment (the one running Logto auth)
- Access to the **new** Convex deployment (target: `affable-ostrich-784` or your production deployment)
- A [Resend](https://resend.com) account with an API key
- Node.js 18+

## Overview

| Step | What | Where |
|------|------|-------|
| 1 | Generate JWT keys | Local machine |
| 2 | Set Convex environment variables | New Convex deployment |
| 3 | Deploy code to the new deployment | Local machine → Convex |
| 4 | Export data from old deployment | Local machine |
| 5 | Transform exported data | Local machine |
| 6 | Import data into new deployment | Local machine → Convex |
| 7 | Configure Next.js environment | `.env.local` / hosting provider |
| 8 | Verify and cut over | Browser |

---

## Step 1: Generate JWT Keys

Convex Auth requires an RSA key pair for signing JWTs.

```bash
node generateKeys.mjs > /tmp/convex-auth-keys.txt
```

This produces two values:
- `JWT_PRIVATE_KEY` — RSA private key (single line, spaces instead of newlines)
- `JWKS` — JSON Web Key Set (public key)

Keep this file around until Step 2 is done, then delete it.

---

## Step 2: Set Convex Environment Variables

All of these go on the **new** Convex deployment. You can set them via the dashboard UI (Settings → Environment Variables) or CLI.

### Required for auth

```bash
# JWT keys (use the file from Step 1 to avoid shell quoting issues)
npx convex env set JWT_PRIVATE_KEY -- "$(grep JWT_PRIVATE_KEY /tmp/convex-auth-keys.txt | sed 's/JWT_PRIVATE_KEY="//' | sed 's/"$//')"
npx convex env set JWKS -- "$(grep JWKS /tmp/convex-auth-keys.txt | sed 's/JWKS=//')"

# Resend API key for sending magic link emails
npx convex env set AUTH_RESEND_KEY "re_YOUR_PRODUCTION_RESEND_KEY"

# The public URL of your site (used in magic link emails)
# For local dev: http://localhost:3000
# For production: https://your-domain.com
npx convex env set SITE_URL "https://your-production-domain.com"
```

### Required for app functionality

```bash
# Default team name for new users
npx convex env set DEFAULT_TEAM_NAME "Arizona Integrated Medical"

# Team defaults (used when creating new teams)
npx convex env set DEFAULT_TEAM_CONTACT_PHONE "+14805551234"
npx convex env set APPOINTMENT_TIMEZONE "America/Phoenix"
npx convex env set HOSPITAL_ADDRESS "Your clinic address here"
```

### Optional (SMS, observability)

These are only needed if you use the corresponding features:

```bash
# Twilio SMS
npx convex env set TWILIO_ACCOUNT_SID "AC..."
npx convex env set TWILIO_AUTH_TOKEN "..."
npx convex env set TWILIO_MESSAGING_SERVICE_SID "MG..."

# GoHighLevel SMS webhook (alternative to Twilio)
npx convex env set GHL_SMS_WEBHOOK_URL "https://..."

# SMS quiet hours (24h format, in the APPOINTMENT_TIMEZONE)
npx convex env set SMS_QUIET_HOURS_START "21:00"
npx convex env set SMS_QUIET_HOURS_END "08:00"

# Base URL for patient-facing links in SMS messages
npx convex env set BASE_URL "https://your-production-domain.com"
```

### Verify

```bash
npx convex env list
```

Confirm `JWT_PRIVATE_KEY`, `JWKS`, `AUTH_RESEND_KEY`, `SITE_URL`, and `DEFAULT_TEAM_NAME` are all present.

---

## Step 3: Deploy Code

Push the updated schema and functions to the new deployment:

```bash
npx convex deploy
```

This deploys the schema (with `authTables`), the auth HTTP routes, and all updated Convex functions.

---

## Step 4: Export Data from Old Deployment

Point to the **old** deployment and export:

```bash
# Temporarily override to target the old deployment
CONVEX_DEPLOYMENT=dev:OLD_DEPLOYMENT_NAME npx convex export --path ./export
```

Replace `OLD_DEPLOYMENT_NAME` with the slug of your old deployment (e.g., `reminiscent-hornet-30`).

This creates a directory `./export` with one `.jsonl` file per table.

---

## Step 5: Transform Exported Data

The transform script adapts the data for the new schema:

```bash
node scripts/transform-export.mjs ./export ./export-transformed
```

What it does:
- **Copies** all business data tables (appointments, patients, teams, messages, etc.)
- **Transforms** the `users` table to be compatible with the new schema (optional fields)
- **Skips** Convex Auth managed tables (`authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`) — these will be created fresh when users sign in

---

## Step 6: Import Data into New Deployment

Point to the **new** deployment and import:

```bash
npx convex import --path ./export-transformed
```

If the deployment already has data and you want to replace it:

```bash
npx convex import --path ./export-transformed --replace
```

After import, verify in the Convex dashboard that tables like `appointments`, `patients`, `teams`, and `users` have the expected row counts.

---

## Step 7: Configure Next.js Environment

### Local development (`.env.local`)

```
CONVEX_DEPLOYMENT=dev:affable-ostrich-784
CONVEX_URL=https://affable-ostrich-784.convex.cloud
NEXT_PUBLIC_CONVEX_URL=https://affable-ostrich-784.convex.cloud
CONVEX_DEPLOY_KEY=dev:affable-ostrich-784|YOUR_DEPLOY_KEY

# Resend key (for local testing of magic link emails)
AUTH_RESEND_KEY=re_YOUR_DEV_RESEND_KEY
SITE_URL=http://localhost:3000
```

Get a deploy key from: Dashboard → Your Deployment → Settings → Deploy Keys.

The deploy key is required for API routes that call internal Convex functions (e.g., SMS status updates, cancellation webhooks).

### Production (Vercel / hosting provider)

Set these environment variables in your hosting provider's dashboard:

| Variable | Value |
|----------|-------|
| `CONVEX_DEPLOYMENT` | `prod:YOUR_PROD_DEPLOYMENT` |
| `CONVEX_URL` | `https://YOUR_PROD_DEPLOYMENT.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_URL` | `https://YOUR_PROD_DEPLOYMENT.convex.cloud` |
| `CONVEX_DEPLOY_KEY` | Production deploy key from Convex dashboard |
| `SITE_URL` | `https://your-production-domain.com` |

Plus any SMS/observability vars (`TWILIO_*`, `GHL_SMS_WEBHOOK_URL`, `BETTERSTACK_*`).

**Remove** all old Logto variables:
- `LOGTO_ENDPOINT`
- `LOGTO_APP_ID`
- `LOGTO_APP_SECRET`
- `LOGTO_BASE_URL`
- `LOGTO_COOKIE_SECRET`

---

## Step 8: Verify and Cut Over

### 8a. Smoke test locally

```bash
npm run dev
```

1. Open http://localhost:3000
2. Click "Sign In"
3. Enter an email address that exists in the migrated `users` table
4. Check your email for the magic link
5. Click the link — you should be redirected to the homepage
6. Verify:
   - Header shows the correct team name (e.g., "Arizona Integrated Medical")
   - `/appointments` page loads and shows any migrated appointments
   - `/patients` page loads and shows migrated patients
   - `/messages` page loads

### 8b. Test a new user

1. Sign out
2. Sign in with an email **not** in the database
3. Verify a new user and team are created (check the Convex dashboard `users` table)
4. The default team name should be whatever you set in `DEFAULT_TEAM_NAME`

### 8c. Production deploy

```bash
# Deploy Next.js to your hosting provider (e.g., Vercel)
# Make sure all env vars from Step 7 are set in the production environment

# For Convex production deployment:
npx convex deploy --prod
```

### 8d. Update SITE_URL for production

After deploying, update the `SITE_URL` on the **production** Convex deployment to your actual production domain:

```bash
npx convex env set SITE_URL "https://your-production-domain.com" --prod
```

This ensures magic link emails contain the correct URL.

---

## Post-Migration Cleanup

After verifying everything works in production:

1. **Delete temporary key file**: `rm /tmp/convex-auth-keys.txt`
2. **Delete export directories**: `rm -rf ./export ./export-transformed`
3. **Decommission old deployment**: Once confident, you can pause or delete the old Convex deployment from the dashboard
4. **Decommission Logto**: Cancel/remove your Logto instance
5. **Remove legacy code** (optional): The `getOrCreateUserByEmail` mutation in `convex/users.ts` is kept for backward compatibility but is no longer called. It can be removed in a future cleanup.

---

## Troubleshooting

### "Not authenticated" error after login

The `ensureTeam` mutation may fail if the user record hasn't been fully created by Convex Auth yet. A hard refresh usually resolves this on first login.

### Magic link email not arriving

- Check the `AUTH_RESEND_KEY` is set correctly on the Convex deployment
- Check the Resend dashboard for delivery logs
- For local dev, make sure `SITE_URL` is `http://localhost:3000`

### "User not found in database" errors

This means the authenticated user's Convex `_id` doesn't match any document in the `users` table. This can happen if:
- Data wasn't imported correctly (re-run Steps 4-6)
- The user is signing in for the first time (Convex Auth creates a new user record automatically)

### 500 errors on API routes

Check that `CONVEX_DEPLOY_KEY` is set in `.env.local` (or your hosting env). API routes that call internal Convex functions (e.g., message status updates) require this key.

### "Unknown Team" in the header

The user exists but has no team assigned. Navigate to any page — the `ensureTeam` mutation runs on page load and creates a team automatically. Refresh after the first load.

### Port conflict on local dev

If `npm run dev` starts on port 3001 instead of 3000, another process is using port 3000. Either kill it (`lsof -ti:3000 | xargs kill`) or update `SITE_URL` on the Convex deployment to `http://localhost:3001`.
