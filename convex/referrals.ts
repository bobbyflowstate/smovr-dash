import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Create a new referral for a patient.
 * Generates a unique token for the public status landing page.
 */
export const create = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
    referralName: v.optional(v.string()),
    referralAddress: v.optional(v.string()),
    referralPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    followUpDelay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("referrals.create", {
      userEmail: args.userEmail,
      patientId: args.patientId,
    });

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user || !user.teamId) {
      log.error("User not found or no team");
      throw new Error("User not found");
    }
    const teamId = user.teamId;

    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.teamId !== teamId) {
      log.error("Patient not found or not in user's team");
      throw new Error("Patient not found");
    }

    // Generate a unique token (retry on unlikely collision)
    let token = generateToken();
    let existing = await ctx.db
      .query("referrals")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    while (existing) {
      token = generateToken();
      existing = await ctx.db
        .query("referrals")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
    }

    const referralId = await ctx.db.insert("referrals", {
      patientId: args.patientId,
      teamId,
      referralName: args.referralName,
      referralAddress: args.referralAddress,
      referralPhone: args.referralPhone,
      notes: args.notes,
      status: "pending",
      followUpDelay: args.followUpDelay ?? 0,
      token,
      createdAt: new Date().toISOString(),
    });

    log.info("Created referral", { referralId, token, followUpDelay: args.followUpDelay ?? 0 });
    return { referralId, token };
  },
});

/**
 * List referrals for a given patient (staff view).
 */
export const listForPatient = query({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("referrals.listForPatient", {
      userEmail: args.userEmail,
      patientId: args.patientId,
    });

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user || !user.teamId) {
      log.error("User not found or no team");
      return [];
    }
    const teamId = user.teamId;

    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.teamId !== teamId) {
      log.error("Patient not found or not in user's team");
      return [];
    }

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .collect();

    log.debug("Fetched referrals for patient", { count: referrals.length });
    return referrals;
  },
});

/**
 * Public query: look up a referral by its unique token.
 * Returns only non-sensitive fields (no referral details).
 */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!referral) return null;

    const team = await ctx.db.get(referral.teamId);
    const patient = await ctx.db.get(referral.patientId);

    return {
      _id: referral._id,
      status: referral.status,
      statusUpdatedAt: referral.statusUpdatedAt,
      createdAt: referral.createdAt,
      teamName: team?.name ?? "Our Office",
      languageMode: team?.languageMode ?? "en_es",
      patientName: patient?.name ?? null,
    };
  },
});

/**
 * Public mutation: patient updates their referral status from the landing page.
 */
export const updateStatusByToken = mutation({
  args: {
    token: v.string(),
    status: v.union(v.literal("confirmed"), v.literal("needs_help")),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("referrals.updateStatusByToken", {
      token: args.token,
      status: args.status,
    });

    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!referral) {
      log.error("Referral not found by token");
      throw new Error("Referral not found");
    }

    await ctx.db.patch(referral._id, {
      status: args.status,
      statusUpdatedAt: new Date().toISOString(),
    });

    // Log the status change as an audit log
    const action = args.status === "confirmed" ? "referral_confirmed" : "referral_needs_help";
    await ctx.db.insert("logs", {
      patientId: referral.patientId,
      teamId: referral.teamId,
      action,
      message: `Referral status updated to "${args.status}" via landing page`,
      timestamp: new Date().toISOString(),
    });

    log.info("Updated referral status", { referralId: referral._id, status: args.status });
    return { success: true };
  },
});

/**
 * Internal: mark a referral's follow-up as sent.
 */
export const markFollowUpSent = internalMutation({
  args: { referralId: v.id("referrals") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.referralId, {
      followUpSentAt: new Date().toISOString(),
    });
  },
});

/**
 * Internal: get referrals that need their follow-up sent (delayed follow-ups).
 * Returns referrals where:
 * - followUpSentAt is not set
 * - createdAt + followUpDelay has passed
 */
export const getPendingFollowUps = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const referrals = await ctx.db.query("referrals").collect();

    return referrals.filter((r) => {
      if (r.followUpSentAt) return false;
      const delay = (r.followUpDelay ?? 0) * 60 * 1000;
      const sendAfter = new Date(r.createdAt).getTime() + delay;
      return now >= sendAfter;
    });
  },
});
