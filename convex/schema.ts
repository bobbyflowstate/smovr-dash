import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth standard fields
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific fields
    teamId: v.optional(v.id("teams")),
    tokenIdentifier: v.optional(v.string()),
    clinicRole: v.optional(v.union(v.literal("operator"), v.literal("manager"))),
  })
    .index("email", ["email"])
    .index("by_token", ["tokenIdentifier"]),

  teams: defineTable({
    name: v.string(),
    contactPhone: v.optional(v.string()),
    timezone: v.optional(v.string()), // IANA timezone, e.g. "America/Phoenix"
    hospitalAddress: v.optional(v.string()), // Included in SMS messages
    languageMode: v.optional(v.union(v.literal("en"), v.literal("en_es"))), // default "en_es"
    rescheduleUrl: v.optional(v.string()), // overrides default /book/[slug] scheduling link
    entrySlug: v.optional(v.string()), // unique slug for /chat/[slug] website button URL
    features: v.optional(v.record(v.string(), v.boolean())),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.string()),
    archivedBy: v.optional(v.string()),
  }),

  patients: defineTable({
    phone: v.string(),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    birthday: v.optional(v.string()), // MM-DD (month and day only)
    recommendedReturnDate: v.optional(v.string()), // ISO date YYYY-MM-DD
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
    .index("by_dateTime", ["dateTime"]),

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
    .index("by_team_appointment", ["teamId", "appointmentId"]),

  logs: defineTable({
    appointmentId: v.optional(v.id("appointments")),
    patientId: v.id("patients"),
    action: v.string(), // "15-late", "30-late", "reschedule-cancel", "referral_confirmed", "referral_needs_help", "website_entry", "reactivation_sent"
    message: v.string(),
    teamId: v.id("teams"),
    timestamp: v.string(), // ISO timestamp
  })
    .index("by_team", ["teamId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_appointment_action", ["appointmentId", "action"]),

  // ============================================
  // Referrals
  // ============================================

  referrals: defineTable({
    patientId: v.id("patients"),
    teamId: v.id("teams"),
    referralName: v.optional(v.string()),
    referralAddress: v.optional(v.string()),
    referralPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("needs_help")),
    statusUpdatedAt: v.optional(v.string()), // ISO timestamp
    followUpSentAt: v.optional(v.string()), // ISO timestamp
    followUpDelay: v.optional(v.number()), // minutes before follow-up is sent (0 = immediate)
    token: v.string(), // unique token for /referral-status/[token] landing page
    createdAt: v.string(),
  })
    .index("by_team", ["teamId"])
    .index("by_patient", ["patientId"])
    .index("by_token", ["token"])
    .index("by_team_status", ["teamId", "status"]),

  // ============================================
  // Scheduling Requests
  // ============================================

  schedulingRequests: defineTable({
    patientId: v.optional(v.id("patients")),
    teamId: v.id("teams"),
    source: v.union(
      v.literal("booking_page"),
      v.literal("website_button"),
      v.literal("reactivation"),
    ),
    status: v.union(v.literal("pending"), v.literal("scheduled"), v.literal("dismissed")),
    patientName: v.optional(v.string()),
    patientPhone: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    resolvedAt: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_team_status", ["teamId", "status"]),

  // ============================================
  // Two-Way SMS Messaging
  // ============================================

  // SMS Messages (conversation history - both inbound and outbound)
  messages: defineTable({
    teamId: v.id("teams"),
    patientId: v.id("patients"),
    appointmentId: v.optional(v.id("appointments")), // optional context link

    // Message content
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    body: v.string(),
    phone: v.string(), // patient phone (for quick lookups)

    // Status tracking
    status: v.union(
      v.literal("pending"), // queued to send
      v.literal("sent"), // accepted by provider
      v.literal("delivered"), // confirmed delivered (if provider reports back)
      v.literal("failed"), // send failed
      v.literal("received") // inbound message
    ),

    // Timestamps
    createdAt: v.string(), // when record created
    sentAt: v.optional(v.string()), // when sent (outbound)
    deliveredAt: v.optional(v.string()), // when delivered (if known)

    // Attribution (outbound only)
    sentByUserId: v.optional(v.id("users")),
    sentByEmail: v.optional(v.string()),

    // Provider metadata
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),

    // Template reference (if sent from template)
    templateId: v.optional(v.id("messageTemplates")),
  })
    .index("by_team", ["teamId"])
    .index("by_patient", ["patientId"])
    .index("by_team_patient", ["teamId", "patientId"])
    .index("by_team_createdAt", ["teamId", "createdAt"]),

  // Conversation summaries (for list view performance)
  conversations: defineTable({
    teamId: v.id("teams"),
    patientId: v.id("patients"),
    patientPhone: v.string(),
    patientName: v.optional(v.string()),

    // Last message preview
    lastMessageBody: v.string(),
    lastMessageDirection: v.union(v.literal("inbound"), v.literal("outbound")),
    lastMessageAt: v.string(),

    // Unread tracking
    unreadCount: v.number(),

    // Link to upcoming appointment (if any)
    latestAppointmentId: v.optional(v.id("appointments")),
  })
    .index("by_team", ["teamId"])
    .index("by_team_lastMessage", ["teamId", "lastMessageAt"])
    .index("by_team_patient", ["teamId", "patientId"]),

  // Message templates (quick replies)
  messageTemplates: defineTable({
    teamId: v.id("teams"),
    name: v.string(), // e.g., "Running Late"
    body: v.string(), // e.g., "No problem! We'll see you when you arrive."
    category: v.optional(v.string()), // e.g., "Scheduling", "General"
    sortOrder: v.number(),
    isActive: v.boolean(),
    // Supported placeholders: {{patientName}}, {{appointmentDate}}, {{appointmentTime}}
  })
    .index("by_team", ["teamId"])
    .index("by_team_active", ["teamId", "isActive"]),

  // Team SMS configuration (per-tenant provider settings)
  teamSmsConfig: defineTable({
    teamId: v.id("teams"),
    provider: v.union(
      v.literal("ghl"), // GoHighLevel (webhook-based)
      v.literal("twilio"), // Twilio (API-based)
      v.literal("mock") // Mock for development/testing
    ),
    isEnabled: v.boolean(),
    fromNumber: v.optional(v.string()), // outbound caller ID

    // For webhook-based providers (GHL)
    webhookUrl: v.optional(v.string()),

    // For API-based providers, store env var prefix (not actual secrets)
    // e.g., "TEAM_ABC123" → looks up TEAM_ABC123_TWILIO_ACCOUNT_SID at runtime
    credentialsEnvPrefix: v.optional(v.string()),

    // Inbound webhook secret (for signature verification)
    inboundWebhookSecret: v.optional(v.string()),
  })
    .index("by_team", ["teamId"]),

  opsAdmins: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    createdAt: v.string(),
  })
    .index("by_email", ["email"]),
});
