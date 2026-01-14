import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getEligibleReminderRangesISO } from "./reminder_logic";
import type { Id } from "./_generated/dataModel";

type AlertSeverity = "warn" | "critical";

function severityRank(s: AlertSeverity): number {
  return s === "critical" ? 2 : 1;
}

function parseSeverity(raw: string | null | undefined): AlertSeverity | null {
  if (raw === "warn" || raw === "critical") return raw;
  return null;
}

function minutesBetween(aISO: string, bISO: string): number | null {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  if (!isFinite(a) || !isFinite(b)) return null;
  return (b - a) / (1000 * 60);
}

async function postSlackWebhook(webhookUrl: string, text: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
  }
}

/**
 * Send a Slack test message to all enabled Slack subscriptions.
 * This is the quickest way to validate your Slack webhook + DB wiring.
 */
export const sendTestSlackAlert = internalAction({
  args: {
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.runQuery(internal.alerts_db.listEnabledAlertSubscriptions, {});
    const slackSubs = subscriptions.filter((s) => s.destinationType === "slack");
    const text =
      args.text ??
      `Alerting test from Convex (${new Date().toISOString()}). If you see this, alertSubscriptions -> Slack delivery works.`;

    const results = await Promise.all(
      slackSubs.map(async (s) => {
        try {
          await postSlackWebhook(s.destination, text);
          return { subscriptionId: String(s._id), ok: true as const, teamId: s.teamId ?? null };
        } catch (e) {
          return {
            subscriptionId: String(s._id),
            ok: false as const,
            teamId: s.teamId ?? null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );

    return {
      attempted: slackSubs.length,
      delivered: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      note:
        slackSubs.length === 0
          ? 'No enabled Slack subscriptions found. Ensure alertSubscriptions has enabled=true and destinationType="slack".'
          : "Done.",
    };
  },
});

/**
 * Scheduled monitor:
 * - Computes high-signal metrics from durable DB state (`reminderAttempts`)
 * - Sends Slack notifications (email later)
 * - Dedupes alerts to avoid paging every minute
 */
export const monitorAndAlert = internalAction({
  handler: async (ctx) => {
    const now = new Date();
    const nowISO = now.toISOString();

    // Rolling windows tuned to be cheap + responsive.
    const windowMinutes = 10;
    const graceMinutes = 3; // allow time for reminder cron to run + record attempts

    const windowStartISO = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();
    const graceStartISO = new Date(now.getTime() - graceMinutes * 60 * 1000).toISOString();

    // Alert thresholds (can be tuned with real traffic).
    const THRESHOLDS = {
      failedWebhookWarn: 3,
      failedWebhookCritical: 10,
      failedPreconditionWarn: 3,
      failedPreconditionCritical: 10,
      missingAttemptsWarn: 2,
      missingAttemptsCritical: 5,
      cancelledSmsMissingWarn: 1,
      cancelledSmsMissingCritical: 3,
    } as const;

    const subscriptions = await ctx.runQuery(internal.alerts_db.listEnabledAlertSubscriptions, {});

    const implicitGlobalSlack = process.env.ALERT_SLACK_WEBHOOK_URL;
    const implicitSeverity = parseSeverity(process.env.ALERT_SLACK_MIN_SEVERITY) ?? "warn";

    type Recipient = { destinationType: string; destination: string; severity: AlertSeverity; teamId: Id<"teams"> | null };
    const allRecipients: Recipient[] = [
      ...subscriptions.map((s) => ({
        destinationType: s.destinationType,
        destination: s.destination,
        severity: parseSeverity(s.severity) ?? "warn",
        teamId: (s.teamId ?? null) as Id<"teams"> | null,
      })),
      ...(implicitGlobalSlack
        ? [
            {
              destinationType: "slack",
              destination: implicitGlobalSlack,
              severity: implicitSeverity,
              teamId: null,
            } satisfies Recipient,
          ]
        : []),
    ];

    const recipientsFor = (args: { teamId: Id<"teams"> | null; severity: AlertSeverity }): Recipient[] => {
      const eligible = allRecipients.filter((r) => severityRank(r.severity) <= severityRank(args.severity));
      const teamMatches = eligible.filter((r) => (args.teamId ? r.teamId === args.teamId : r.teamId === null));
      if (teamMatches.length > 0) return teamMatches;
      // If no team-specific subscriptions exist, fall back to global ops so alerts still get seen.
      return eligible.filter((r) => r.teamId === null);
    };

    const shouldSend = async (args: {
      key: string;
      severity: AlertSeverity;
      suppressMinutes: number;
    }): Promise<boolean> => {
      const dedupe = await ctx.runQuery(internal.alerts_db.getAlertDedupeByKey, { key: args.key });
      if (!dedupe) return true;
      const lastSeverity = parseSeverity(dedupe.lastSeverity) ?? "warn";
      if (severityRank(args.severity) > severityRank(lastSeverity)) return true; // escalation
      const mins = minutesBetween(dedupe.lastSentAt, nowISO);
      if (mins === null) return true;
      return mins >= args.suppressMinutes;
    };

    const recordSent = async (args: { key: string; severity: AlertSeverity }) => {
      await ctx.runMutation(internal.alerts_db.upsertAlertDedupe, {
        key: args.key,
        lastSentAt: nowISO,
        lastSeverity: args.severity,
      });
    };

    const sendAlert = async (args: {
      teamId: Id<"teams"> | null;
      alertType: string;
      severity: AlertSeverity;
      title: string;
      bodyLines: string[];
      suppressMinutes?: number;
    }): Promise<void> => {
      const key = `${args.teamId ?? "global"}:${args.alertType}:${args.severity}`;
      const suppressMinutes = args.suppressMinutes ?? 15;

      const okToSend = await shouldSend({ key, severity: args.severity, suppressMinutes });
      if (!okToSend) return;

      const header = `[${args.severity}] ${args.title}`;
      const text = [header, ...args.bodyLines].join("\n");

      const recipients = recipientsFor({ teamId: args.teamId, severity: args.severity });
      if (recipients.length === 0) {
        console.warn(`Alert suppressed (no recipients): ${key}`);
        return;
      }

      const slackRecipients = recipients.filter((r) => r.destinationType === "slack");
      await Promise.all(
        slackRecipients.map(async (r) => {
          await postSlackWebhook(r.destination, text);
        })
      );

      await recordSent({ key, severity: args.severity });
    };

    // 1) Webhook failure spike
    const failedWebhookAttempts = await ctx.runQuery(internal.alerts_db.getReminderAttemptsByStatusSince, {
      status: "failed_webhook",
      startISO: windowStartISO,
    });
    const failedWebhookCount = failedWebhookAttempts.length;
    if (failedWebhookCount >= THRESHOLDS.failedWebhookWarn) {
      const severity: AlertSeverity =
        failedWebhookCount >= THRESHOLDS.failedWebhookCritical ? "critical" : "warn";
      await sendAlert({
        teamId: null,
        alertType: "failed_webhook_spike",
        severity,
        title: "SMS webhook failure spike",
        bodyLines: [
          `window=${windowMinutes}m now=${nowISO}`,
          `failed_webhook_count=${failedWebhookCount}`,
        ],
      });
    }

    // 2) Precondition/config failures
    const failedPreconditionAttempts = await ctx.runQuery(internal.alerts_db.getReminderAttemptsByStatusSince, {
      status: "failed_precondition",
      startISO: windowStartISO,
    });
    const failedPreconditionCount = failedPreconditionAttempts.length;
    if (failedPreconditionCount >= THRESHOLDS.failedPreconditionWarn) {
      const severity: AlertSeverity =
        failedPreconditionCount >= THRESHOLDS.failedPreconditionCritical ? "critical" : "warn";
      const topReasons = new Map<string, number>();
      for (const a of failedPreconditionAttempts) {
        topReasons.set(a.reasonCode, (topReasons.get(a.reasonCode) ?? 0) + 1);
      }
      const topReasonLines = [...topReasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => `- ${reason}: ${count}`);

      await sendAlert({
        teamId: null,
        alertType: "failed_precondition_spike",
        severity,
        title: "Reminder precondition/config failure spike",
        bodyLines: [
          `window=${windowMinutes}m now=${nowISO}`,
          `failed_precondition_count=${failedPreconditionCount}`,
          ...(topReasonLines.length ? ["top_reason_codes:", ...topReasonLines] : []),
        ],
      });
    }

    // 3) “System checks stopped running” detector (missing attempts)
    const ranges = getEligibleReminderRangesISO(now);
    const [appts1h, appts24h] = await Promise.all([
      ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["1h"].startISO,
        endISO: ranges["1h"].endISO,
      }),
      ctx.runQuery(internal.reminders.getAppointmentsInRange, {
        startISO: ranges["24h"].startISO,
        endISO: ranges["24h"].endISO,
      }),
    ]);

    const recentAttempts = await ctx.runQuery(internal.alerts_db.getReminderAttemptsSince, {
      startISO: graceStartISO,
    });
    const recentKey = new Set<string>();
    for (const a of recentAttempts) {
      // Only count the reminder windows we expect the cron to record.
      if (a.reminderType !== "1h" && a.reminderType !== "24h") continue;
      recentKey.add(`${String(a.appointmentId)}:${a.reminderType}`);
    }

    type Expected = { appointmentId: Id<"appointments">; teamId: Id<"teams">; reminderType: "1h" | "24h" };
    const expected: Expected[] = [
      ...appts1h.map((a) => ({ appointmentId: a._id, teamId: a.teamId, reminderType: "1h" as const })),
      ...appts24h.map((a) => ({ appointmentId: a._id, teamId: a.teamId, reminderType: "24h" as const })),
    ];

    let missingTotal = 0;
    for (const e of expected) {
      if (recentKey.has(`${String(e.appointmentId)}:${e.reminderType}`)) continue;
      missingTotal++;
    }

    if (expected.length > 0 && missingTotal >= THRESHOLDS.missingAttemptsWarn) {
      const severity: AlertSeverity =
        missingTotal >= THRESHOLDS.missingAttemptsCritical ? "critical" : "warn";

      await sendAlert({
        teamId: null,
        alertType: "missing_attempts",
        severity,
        title: "Missing reminder attempts (cron may not be running)",
        bodyLines: [
          `now=${nowISO} expected_window_grace=${graceMinutes}m`,
          `expected=${expected.length} missing=${missingTotal}`,
          `note=expected is appointments currently in 1h/24h reminder windows; missing means no recent attempt record`,
        ],
      });
    }

    // 4) Cancellation SMS missing (best-effort)
    const cancelledStartISO = windowStartISO;
    const cancelledEndISO = nowISO;
    const cancelled = await ctx.runQuery(internal.alerts_db.getCancelledAppointmentsInWindow, {
      startISO: cancelledStartISO,
      endISO: cancelledEndISO,
    });

    let cancelledMissingTotal = 0;
    for (const appt of cancelled) {
      if (!appt.cancelledAt) continue;
      const latest = await ctx.runQuery(internal.alerts_db.getLatestAttemptForAppointmentReminderType, {
        appointmentId: appt._id,
        reminderType: "cancellation",
      });
      if (!latest) {
        cancelledMissingTotal++;
        continue;
      }
      const mins = minutesBetween(appt.cancelledAt, latest.attemptedAt);
      // We expect cancellation send attempt within ~1–2 minutes of cancelledAt.
      if (mins === null || mins < 0 || mins > 2) cancelledMissingTotal++;
    }

    if (cancelled.length > 0 && cancelledMissingTotal >= THRESHOLDS.cancelledSmsMissingWarn) {
      const severity: AlertSeverity =
        cancelledMissingTotal >= THRESHOLDS.cancelledSmsMissingCritical ? "critical" : "warn";
      await sendAlert({
        teamId: null,
        alertType: "cancellation_sms_missing",
        severity,
        title: "Cancellation SMS attempts missing",
        bodyLines: [
          `window=${windowMinutes}m now=${nowISO}`,
          `cancelled_recent=${cancelled.length} missing_cancellation_attempts=${cancelledMissingTotal}`,
        ],
      });
    }
  },
});

