import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  patients: defineTable({
    name: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
  }).index("by_phone", ["phone"]),

  appointments: defineTable({
    patientId: v.id("patients"),
    dateTime: v.string(),
    notes: v.optional(v.string()),
  }),
});
