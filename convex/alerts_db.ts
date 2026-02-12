import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const listEnabledAlertSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("alertSubscriptions")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

export const getAlertDedupeByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("alertDedupe")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const upsertAlertDedupe = internalMutation({
  args: {
    key: v.string(),
    lastSentAt: v.string(),
    lastSeverity: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("alertDedupe")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSentAt: args.lastSentAt,
        lastSeverity: args.lastSeverity,
      });
      return existing._id;
    }
    return await ctx.db.insert("alertDedupe", {
      key: args.key,
      lastSentAt: args.lastSentAt,
      lastSeverity: args.lastSeverity,
    });
  },
});

export const clearAlertDedupe = internalMutation({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.key) {
      const existing = await ctx.db
        .query("alertDedupe")
        .withIndex("by_key", (q) => q.eq("key", args.key!))
        .collect();
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
      return { deleted: existing.length };
    }

    const all = await ctx.db.query("alertDedupe").collect();
    for (const row of all) {
      await ctx.db.delete(row._id);
    }
    return { deleted: all.length };
  },
});

export const getReminderAttemptsByStatusSince = internalQuery({
  args: { status: v.string(), startISO: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reminderAttempts")
      .withIndex("by_status_attemptedAt", (q) =>
        q.eq("status", args.status).gte("attemptedAt", args.startISO)
      )
      .collect();
  },
});

export const getReminderAttemptsSince = internalQuery({
  args: { startISO: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reminderAttempts")
      .withIndex("by_attemptedAt", (q) => q.gte("attemptedAt", args.startISO))
      .collect();
  },
});

export const getCancelledAppointmentsInWindow = internalQuery({
  args: { startISO: v.string(), endISO: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_cancelledAt", (q) =>
        q.gte("cancelledAt", args.startISO).lt("cancelledAt", args.endISO)
      )
      .filter((q) => q.eq(q.field("status"), "cancelled"))
      .collect();
  },
});

export const getLatestAttemptForAppointmentReminderType = internalQuery({
  args: { appointmentId: v.id("appointments"), reminderType: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reminderAttempts")
      .withIndex("by_appointment_type", (q) =>
        q.eq("appointmentId", args.appointmentId).eq("reminderType", args.reminderType)
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

