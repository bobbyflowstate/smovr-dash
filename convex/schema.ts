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
    teamId: v.id("teams"),
  })
    .index("by_appointment_type", ["appointmentId", "reminderType"])
    .index("by_patient_type_date", ["patientId", "reminderType", "targetDate"])
    .index("by_team", ["teamId"]),

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
});
