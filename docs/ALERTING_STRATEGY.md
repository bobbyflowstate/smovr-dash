# Alerting strategy (Convex monitor + reminderAttempts)

This document describes a recommended alerting approach for the appointment reminder system.
The goal is to detect regressions or outages quickly (before admins complain) while keeping alerts low-noise.

## Why DB-driven monitoring (vs log scraping)

We already persist a durable audit trail in `reminderAttempts`. That makes monitoring:

- **Reliable**: independent of log retention/formatting.
- **Queryable**: can slice by team, status, reason code, and time windows.
- **Actionable**: the same data admins see can power alerts.

Logs are still useful for debugging, but alerts should be driven by durable DB state.

## Recommended architecture

### 1) Scheduled Convex monitor

Add a scheduled Convex job (runs every 1–5 minutes) that:

- Queries `reminderAttempts`, `reminders`, and `appointments`
- Computes a few high-signal health metrics over short time windows
- Sends notifications to recipients (Slack and/or email)
- Deduplicates alerts so spikes don’t page repeatedly

### 2) Alert recipient configuration (avoid hardcoding “right people”)

Hardcoding a single email or Slack channel is brittle once teams/staff change.
Instead, store recipients in a small DB table so it can evolve without code changes.

#### Suggested table: `alertSubscriptions` (minimal and flexible)

Fields (suggested):

- **teamId**: optional. If set, the alert targets a specific clinic/team. If omitted, it’s “global ops”.
- **destinationType**: `"slack"` | `"email"`
- **destination**:
  - Slack: webhook URL *or* a channel identifier (see Slack note below)
  - Email: recipient email address
- **severity**: `"warn"` | `"critical"` (which alerts this subscriber receives)
- **enabled**: boolean

This table should be internal-only (not exposed to clients) because destinations can be sensitive.

## Slack vs Email: practical guidance

### Slack (recommended for urgent alerts)

**Pros**
- Fast, visible, easy to route (per team channel or global ops channel)
- Works well for “spikes” and “monitor down” alerts

**Implementation note**
- Start with **Slack Incoming Webhooks** (simplest).
- Webhook URLs are secrets. Treat them like env vars:
  - Prefer storing them as Convex env vars for “global ops”
  - If storing per-team in DB, ensure queries/mutations are internal-only and never returned to clients

### Email (recommended for digests / less urgent notifications)

**Pros**
- Better for daily summaries and compliance

**Cons**
- Easier to miss; slower response time
- Requires an email provider integration and error handling

Recommended pattern:
- **Slack** for warn/critical alerts
- **Email** for daily/weekly digest (optional)

## What to alert on (high signal)

The monitor should focus on conditions that strongly indicate broken behavior:

### 1) Webhook failure spike

Detect spikes in:
- `reminderAttempts.status == "failed_webhook"`

Slice:
- Global spike (overall)
- Per-team spike (helps isolate misconfigured teams)

Send:
- **Warn** if failures exceed a small threshold in a short window
- **Critical** if large spike or sustained failures

### 2) Precondition/configuration failures

Detect spikes in:
- `reminderAttempts.status == "failed_precondition"`

Common causes:
- `BASE_URL_NOT_CONFIGURED`
- invalid quiet hours config (if ever reintroduced)
- missing patient record, etc.

These usually need human action (configuration fix), so they should page the right owner quickly.

### 3) “System checks stopped running” detector (missing attempts)

This catches downtime/regressions even if the webhook is fine.

Approach:
- Find appointments that enter a send window (24h or 1h)
- Expect a corresponding attempt record within a small grace period (e.g. 1–2 minutes)
- If not found, alert because reminder checks may not be running or eligibility queries broke

This is the most important detector for “silent failures”.

### 4) Cancellation SMS missing

Since we keep cancelled appointments for audit, we can verify cancellation messaging:

- For appointments with `status == "cancelled"` and `cancelledAt` within last N minutes,
  ensure there is a `reminderAttempts` record with `reminderType == "cancellation"`
  within ~1–2 minutes of `cancelledAt`.

If missing, the cancel notification pipeline is broken.

## Keeping alerts low-noise

### Rolling windows + thresholds

Use short rolling windows (e.g. last 10 minutes) plus thresholds:

- `failed_webhook_count >= X`
- `failed_precondition_count >= Y`
- `missing_attempts_count >= Z`

Tune X/Y/Z based on real traffic.

### Deduping (alert suppression)

Add a lightweight mechanism so you don’t send the same alert every minute:

- Track `lastAlertSentAt` per alert key (e.g. `teamId + alertType + severity`)
- Only re-send if it’s been at least N minutes or the severity escalates

Optionally send a “recovered” message when a condition clears for a sustained period.

## Implementation plan (for a follow-up PR)

1. Add DB table:
   - `alertSubscriptions` (as described above)
2. Add Convex scheduled job:
   - Runs every 1–5 minutes
   - Computes the metrics above
   - Dedupes and sends Slack notifications
3. Start with Slack:
   - Global ops channel first
   - Add per-team channels when needed
4. Add email digests later (optional)

## Notes / caveats

- **Secrets**: Slack webhook URLs should be treated as secrets.
- **Multi-tenancy**: Always scope monitoring by `teamId` when sending team-specific notifications.
- **Cost**: Monitor queries should use indexes and narrow time windows to stay cheap (minute-level schedule is OK with efficient queries).

