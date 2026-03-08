# Office Deployment Setup Runbook

This runbook is for launching a new office deployment using:
- per-deployment env files (`.env.<office>.<target>`)
- per-office team seed files (`.team.<office>`)

## 1) Prepare local files

Use these local files as your source:
- `.env.arizona.prod`, `.env.arizona.prev`
- `.env.austin.prod`, `.env.austin.prev`
- `.team.arizona`, `.team.austin`

These are gitignored and should contain real secrets locally.

## 2) Required environment variables

Set the same deployment-specific values in **both** places where relevant:

### Vercel env (per target: production/preview)
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_URL`
- `CONVEX_DEPLOY_KEY`
- `SITE_URL`
- `BASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`

### Convex env (matching deployment)
- `OFFICE_ID`
- `AUTH_EMAIL_FROM`
- `AUTH_RESEND_KEY`
- `JWT_PRIVATE_KEY`
- `JWKS`
- `SITE_URL`
- `BASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`

## 3) Generate auth key values (JWT/JWKS)

Generate once (or per environment, if you prefer isolation):

```bash
node generateKeys.mjs > /tmp/convex-auth-keys.txt
```

Copy values from that output into:
- `JWT_PRIVATE_KEY` (single line)
- `JWKS`

## 4) Deploy Convex schema/functions to target deployment

Do not rely on `.env.local` switching. Use one-off key injection:

```bash
CONVEX_DEPLOY_KEY='prod:<deployment>|<key>' npx convex deploy
```

## 5) Seed/update team + team SMS config

Run against the target Convex deployment:

```bash
CONVEX_DEPLOY_KEY='prod:<deployment>|<key>' npx convex run internal.devAdmin.upsertOfficeBootstrap "$(cat .team.<office>)"
```

This upserts:
- `teams` (oldest existing team or creates one)
- `teamSmsConfig` for that team

## 6) Configure Twilio inbound webhook

Inbound endpoint format:

`POST https://<office-domain>/api/webhooks/sms-inbound?team=<TEAM_ID>&provider=twilio`

Example:

`https://yuma.arizonaintegratedmedical.com/api/webhooks/sms-inbound?team=<TEAM_ID>&provider=twilio`

Set this on Twilio:
- Messaging Service inbound webhook (recommended), or
- Phone number webhook

### Important
- `team` query param must be the actual Convex `teams._id`.
- `teamSmsConfig.inboundWebhookSecret` must be set for production inbound verification.
- For Twilio, set `inboundWebhookSecret` to that office/account `TWILIO_AUTH_TOKEN`.

## 7) Fast verification checklist

After Vercel deploy:
1. Magic-link sign-in works.
2. Appointment creation works.
3. Booking SMS sends.
4. Inbound SMS appears in messages.
5. Reminder send path works.

## 8) Common failure checks

- Magic link fails:
  - `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`, `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`.
- Inbound SMS 503:
  - missing `teamSmsConfig.inboundWebhookSecret`.
- Inbound SMS 401:
  - invalid signature secret (wrong Twilio auth token).
- Wrong links in SMS/emails:
  - `SITE_URL` / `BASE_URL` mismatch.
