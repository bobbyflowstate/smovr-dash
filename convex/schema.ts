import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(),
    teamId: v.id("teams"),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  teams: defineTable({
    name: v.string(),
    contactPhone: v.optional(v.string()),
    timezone: v.optional(v.string()), // IANA timezone, e.g. "America/Phoenix"
    hospitalAddress: v.optional(v.string()), // Included in SMS messages
  }),

  patients: defineTable({
    phone: v.string(),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    teamId: v.id("teams"),
  })
    .index("by_phone", ["phone"])
    .index("by_team", ["teamId"]),

  appointments: defineTable({
    patientId: v.id("patients"),
    dateTime: v.string(),
    notes: v.optional(v.string()),
    metadata: v.optional(v.object({})), // Flexible JSON metadata
    status: v.optional(v.string()), // "scheduled" | "cancelled"
    cancelledAt: v.optional(v.string()), // ISO timestamp when cancelled
    cancelledBy: v.optional(v.string()), // user email who cancelled (if known)
    teamId: v.id("teams"),
  })
    .index("by_team", ["teamId"])
    .index("by_dateTime", ["dateTime"])
    // Optional field index: cancelled appointments will have cancelledAt set.
    .index("by_cancelledAt", ["cancelledAt"]),

  reminders: defineTable({
    appointmentId: v.optional(v.id("appointments")), // null for patient reminders like birthdays
    patientId: v.id("patients"),
    reminderType: v.string(), // "24h", "1h", "birthday", etc.
    targetDate: v.string(), // ISO date string for what the reminder is for
    sentAt: v.string(), // ISO timestamp when reminder was sent
    source: v.optional(v.string()), // "automated_check" | "booking_confirmation" | etc.
    teamId: v.id("teams"),
  })
    .index("by_appointment_type", ["appointmentId", "reminderType"])
    .index("by_patient_type_date", ["patientId", "reminderType", "targetDate"])
    .index("by_team", ["teamId"]),

  reminderAttempts: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    reminderType: v.string(), // "24h", "1h", etc.
    targetDate: v.string(), // appointment dateTime ISO (what the reminder is for)
    attemptedAt: v.string(), // ISO timestamp when we attempted/decided
    status: v.string(), // "succeeded" | "skipped_quiet_hours" | "skipped_already_sent" | "failed_precondition" | "failed_webhook" | ...
    reasonCode: v.string(), // stable machine-readable reason
    note: v.string(), // short human-readable explanation for dashboards
    detailsJson: v.optional(v.string()), // JSON string with structured context for debugging
    teamId: v.id("teams"),
  })
    .index("by_appointment_type", ["appointmentId", "reminderType"])
    .index("by_team", ["teamId"])
    .index("by_team_appointment", ["teamId", "appointmentId"])
    // Monitoring-friendly indexes (rolling window queries).
    .index("by_attemptedAt", ["attemptedAt"])
    .index("by_status_attemptedAt", ["status", "attemptedAt"])
    .index("by_team_status_attemptedAt", ["teamId", "status", "attemptedAt"]),

  logs: defineTable({
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    action: v.string(), // "15-late", "30-late", "reschedule-cancel"
    message: v.string(), // Human-readable message
    teamId: v.id("teams"),
    timestamp: v.string(), // ISO timestamp
  })
    .index("by_team", ["teamId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_appointment_action", ["appointmentId", "action"]),

  /**
   * Internal-only alerting configuration.
   *
   * Destinations can be sensitive (Slack webhook URLs, emails), so this table
   * should never be exposed directly to clients.
   */
  alertSubscriptions: defineTable({
    teamId: v.optional(v.id("teams")), // null/undefined => global ops
    destinationType: v.string(), // "slack" | "email"
    destination: v.string(), // Slack incoming webhook URL or email address
    severity: v.string(), // "warn" | "critical"
    enabled: v.boolean(),
    createdAt: v.string(), // ISO timestamp
  })
    .index("by_enabled", ["enabled"])
    .index("by_team_enabled", ["teamId", "enabled"]),

  /**
   * Alert dedupe state so we don't send the same alert every minute.
   * Key format is owned by the monitor job (e.g. "global:failed_webhook:warn").
   */
  alertDedupe: defineTable({
    key: v.string(),
    lastSentAt: v.string(), // ISO timestamp
    lastSeverity: v.string(), // "warn" | "critical"
  }).index("by_key", ["key"]),
});
