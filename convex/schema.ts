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
  }),

  patients: defineTable({
    name: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
    teamId: v.id("teams"),
  })
    .index("by_phone", ["phone"])
    .index("by_team", ["teamId"]),

  appointments: defineTable({
    patientId: v.id("patients"),
    dateTime: v.string(),
    notes: v.optional(v.string()),
    teamId: v.id("teams"),
  }).index("by_team", ["teamId"]),
});
