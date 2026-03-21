# Multi-Tenancy and Internal Ops Dashboard

This document explains the new multi-tenant architecture and internal operations dashboard. It is written for operators / COO-level staff who need to understand the system and set up new clinics.

---

## How It Works Now vs. Before

### Before (one deployment per clinic)

Each clinic had its own separate Vercel deployment and Convex backend. Adding a new clinic meant:

1. Creating a new Convex project
2. Creating a new Vercel project
3. Setting up a new domain
4. Configuring dozens of environment variables
5. Seeding initial team data via CLI
6. Setting up Twilio phone numbers and webhooks

This process took roughly a week per clinic.

### Now (multi-tenant single deployment)

All clinics share **one** Vercel deployment and **one** Convex backend. Each clinic is a "team" row in the database. Adding a new clinic takes minutes:

1. Log in to the `/ops` dashboard
2. Fill out the "Create Team" form
3. Done — the clinic is live

The public-facing pages (`/book/[slug]`, `/chat/[slug]`) already route by slug, so they work automatically for any team. SMS, reminders, referrals, and all other features are scoped per-team.

---

## Key Concepts

### Teams

A **team** is a clinic / office / location. Every piece of data in the system (patients, appointments, messages, etc.) belongs to exactly one team. Teams are identified by their Convex document ID and optionally by an **entry slug** used in public URLs.

### Ops Admins

Ops admins are internal staff with access to the `/ops` dashboard. They have their own login credentials (email + password), completely separate from the clinic user auth (magic links). Ops admins can see and manage **all** teams.

### Clinic Users (Operators / Managers)

Clinic staff log in via magic link as before. Each user is assigned to exactly one team. They can only see data for their own team. There are two clinic-level roles:

- **Operator** — standard clinic staff access (view/manage patients, appointments, messages)
- **Manager** — same access as operator (extended permissions can be added later)

### Feature Flags

Each team has a set of feature flags that control which capabilities are enabled:

| Flag | Controls |
|------|----------|
| `referrals_enabled` | Referral tracking and follow-up SMS |
| `two_way_sms_enabled` | Two-way SMS messaging |
| `reactivation_enabled` | Lapsed patient reactivation outreach |
| `booking_page_enabled` | Public `/book/[slug]` booking page |
| `website_entry_enabled` | Public `/chat/[slug]` website entry page |
| `birthday_reminders_enabled` | Automated birthday greeting SMS |

All flags default to **enabled**. Disable them from the ops dashboard to match a team's subscription tier.

### Team Archival (Soft Delete)

Teams are never hard-deleted. When a team is archived:
- It disappears from the ops dashboard (unless "Show archived" is checked)
- Its public pages (`/book`, `/chat`) stop working
- Automated reminders and SMS skip it
- Users assigned to it can no longer log in
- All historical data is preserved

---

## Initial Setup

### 1. Environment Variables

In addition to the existing deployment env vars, set one new variable:

**Convex deployment (or `.env.local` for dev):**
```
OPS_JWT_SECRET=<random-string-at-least-32-chars>
```

Generate a strong random value:
```bash
openssl rand -base64 48
```

This secret signs the ops admin session tokens. It is completely separate from the Convex Auth JWT keys.

**Also on Vercel (or hosting provider):**
```
OPS_JWT_SECRET=<same-value-as-above>
```

### 2. Deploy Code

```bash
npx convex deploy
```

This pushes the new schema (adds `opsAdmins` table, `features` field on teams, `clinicRole` on users, archive fields on teams) and the new Convex functions.

### 3. Seed the First Ops Admin

Run this against your Convex deployment:

```bash
npx convex run internal.opsAuth.seedAdmin '{"email":"ops-admin@yourcompany.com", "password":"your-secure-password"}'
```

This creates (or updates) an ops admin account. You can run it again to reset a password.

To add more admins, run the same command with a different email.

### 4. Log In to /ops

Navigate to `https://your-domain.com/ops/login` and sign in with the credentials you just seeded.

---

## Day-to-Day Operations

### Creating a New Clinic

1. Go to `/ops` → click **+ New Team**
2. Fill in the form:
   - **Team Name** (required) — the clinic's display name (e.g., "Austin Family Medicine")
   - **Contact Phone** — the clinic's main phone number
   - **Address** — physical address (included in SMS messages)
   - **Timezone** — select from the dropdown (affects reminder timing, birthday checks, etc.)
   - **Language Mode** — English only, or English + Spanish (bilingual SMS)
   - **Reschedule URL** — external scheduling link, or leave blank to use the built-in booking page
   - **Entry Slug** — the URL path for public pages (e.g., `austin-family` → `/book/austin-family`). Lowercase, letters/numbers/hyphens only. **Cannot be changed after creation.**
3. Toggle feature flags to match the clinic's subscription
4. Optionally configure SMS:
   - **Provider** — Twilio, GoHighLevel, or Mock (for testing)
   - **From Number** — the outbound SMS phone number
   - **Credentials Env Prefix** (Twilio) — maps to env vars like `TEAM_AUSTIN_TWILIO_ACCOUNT_SID`
   - **Inbound Webhook Secret** — for verifying inbound SMS signatures
5. Click **Create Team**

The new clinic is immediately live. Public pages are accessible at `/book/[slug]` and `/chat/[slug]`.

### Assigning Users to a Clinic

When a new clinic user signs in via magic link for the first time:

- **Single-team deployment**: they are automatically assigned to the only team. No action needed.
- **Multi-team deployment**: they see a "Team Assignment Required" message. An ops admin must assign them:

1. Go to `/ops` → click the team
2. Scroll to **Clinic Users** → click **+ Assign User**
3. Select the user from the list
4. Choose a role (Operator or Manager)

To move a user between teams, unassign them from the old team first, then assign to the new one.

### Modifying a Clinic's Settings

1. Go to `/ops` → click the team
2. Edit any field (name, phone, address, timezone, language, URLs)
3. Toggle feature flags as needed
4. Update SMS configuration if the provider changes
5. Click **Save Changes**

### Archiving a Clinic

1. Go to `/ops` → click the team
2. Scroll to the bottom → click **Archive Team**
3. Confirm the action

The team's data is preserved but the team becomes inactive. To restore it, you would need to use the Convex dashboard directly for now (future: an "Unarchive" button in ops).

---

## SMS Configuration per Team

Each team has its own SMS configuration. When using **Twilio**, credentials are stored as environment variable prefixes rather than raw secrets in the database.

For example, if a team's credentials prefix is `TEAM_AUSTIN`, the system looks up:
- `TEAM_AUSTIN_TWILIO_ACCOUNT_SID`
- `TEAM_AUSTIN_TWILIO_AUTH_TOKEN`
- `TEAM_AUSTIN_TWILIO_MESSAGING_SERVICE_SID`

These env vars must be set on the **Convex deployment** before SMS will work for that team.

### Setting up Twilio for a new team

1. In Twilio, provision a phone number (or messaging service)
2. Set the Convex env vars with the team's prefix:
   ```bash
   npx convex env set TEAM_MYOFFICE_TWILIO_ACCOUNT_SID "AC..."
   npx convex env set TEAM_MYOFFICE_TWILIO_AUTH_TOKEN "..."
   npx convex env set TEAM_MYOFFICE_TWILIO_MESSAGING_SERVICE_SID "MG..."
   ```
3. In `/ops` → team detail → SMS Configuration:
   - Provider: Twilio
   - Enabled: on
   - From Number: the provisioned number
   - Credentials Env Prefix: `TEAM_MYOFFICE`
   - Inbound Webhook Secret: the Twilio Auth Token (for signature verification)
4. In Twilio, set the inbound webhook URL:
   ```
   POST https://your-domain.com/api/webhooks/sms-inbound?team=<TEAM_ID>&provider=twilio
   ```
   (The `<TEAM_ID>` is the Convex document ID, visible in the URL when viewing the team in `/ops`.)

---

## Security Model

### Ops admin access

- Ops admins authenticate with email + password at `/ops/login`
- Sessions are JWT-based, stored in an HttpOnly cookie, with 8-hour expiration
- Every `/ops` page and `/api/ops/*` endpoint verifies the JWT signature and expiration in middleware
- Ops auth is completely separate from clinic auth (they don't share tokens, cookies, or user tables)

### Clinic user isolation

- Clinic users can only see data belonging to their assigned team
- All Convex queries and mutations check `user.teamId` before returning data
- There is no way for a clinic user to access another team's patients, appointments, or messages
- Clinic users cannot access `/ops` — the middleware blocks them

### Settings moved to ops-only

The clinic-facing "Settings" page has been removed. Clinics can no longer modify their own team name, phone, address, timezone, language mode, or entry slug. All of these are now managed exclusively through `/ops` by ops admins.

---

## Migrating an Existing Single-Clinic Deployment

If you're upgrading an existing deployment that already has one clinic:

1. Deploy the updated code (`npx convex deploy`)
2. Set `OPS_JWT_SECRET` env var
3. Seed an ops admin (`npx convex run internal.opsAuth.seedAdmin ...`)
4. Log in to `/ops` — your existing team appears automatically
5. Existing users continue to work (single-team auto-assignment is backward-compatible)
6. Set feature flags as desired (all default to enabled)

The existing clinic continues to function exactly as before. The `/settings` page now redirects to the home page; use `/ops` to manage settings going forward.

To add a second clinic, create it via `/ops/teams/new`.

---

## FAQ

**Q: Can a user belong to multiple teams?**
No. Each user is assigned to exactly one team. To move a user, unassign from the current team and assign to the new one.

**Q: What happens if I archive a team that has active users?**
Those users will see a "Team Archived" error when they try to log in. They need to be reassigned to another team via `/ops`.

**Q: Can I change a team's entry slug after creation?**
No. The slug is locked after creation to prevent breaking existing public links (QR codes, printed materials, etc.). Create a new team if you need a different slug.

**Q: How do I add another ops admin?**
Run the seed command again with a different email:
```bash
npx convex run internal.opsAuth.seedAdmin '{"email":"another-admin@company.com", "password":"..."}'
```

**Q: Where did the "Settings" gear icon go?**
It was removed from the clinic dashboard. Team settings are now managed exclusively by ops admins via `/ops`. This prevents clinics from accidentally changing configuration.

**Q: Do I need separate Twilio accounts per clinic?**
Not necessarily. You can use one Twilio account with multiple phone numbers, or separate sub-accounts. The credentials env prefix system supports both approaches.
