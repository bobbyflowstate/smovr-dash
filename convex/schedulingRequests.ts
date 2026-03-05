import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./lib/auth";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

const MAX_REQUESTS_PER_PHONE = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create a scheduling request (public — no auth required).
 * Called from the /book/[slug] form and /entry/[slug] page.
 *
 * Rate-limited: max 3 pending requests per phone+team within a 1-hour window.
 */
export const createPublic = mutation({
  args: {
    teamId: v.id("teams"),
    patientPhone: v.string(),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(
      v.literal("booking_page"),
      v.literal("website_button"),
      v.literal("reactivation"),
    ),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("schedulingRequests.createPublic", {
      teamId: args.teamId,
    });

    const team = await ctx.db.get(args.teamId);
    if (!team) {
      log.error("Team not found");
      throw new Error("Team not found");
    }

    const normalizedPhone = args.patientPhone.replace(/\D/g, "");

    // --- Rate limit: max N requests per phone+team in the rolling window ---
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const recentRequests = await ctx.db
      .query("schedulingRequests")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) =>
        q.and(
          q.eq(q.field("patientPhone"), normalizedPhone),
          q.eq(q.field("status"), "pending"),
          q.gte(q.field("createdAt"), windowStart),
        ),
      )
      .collect();

    if (recentRequests.length >= MAX_REQUESTS_PER_PHONE) {
      log.warn("Rate limit exceeded", { phone: normalizedPhone, count: recentRequests.length });
      throw new Error("Too many requests. Please try again later.");
    }

    // Find or create patient
    let patient = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("phone"), normalizedPhone))
      .first();

    let patientId;
    if (patient) {
      patientId = patient._id;
      if (args.patientName && args.patientName !== patient.name) {
        await ctx.db.patch(patientId, { name: args.patientName });
      }
      log.debug("Found existing patient", { patientId });
    } else {
      patientId = await ctx.db.insert("patients", {
        teamId: args.teamId,
        phone: normalizedPhone,
        name: args.patientName,
      });
      log.debug("Created new patient", { patientId });
    }

    const requestId = await ctx.db.insert("schedulingRequests", {
      teamId: args.teamId,
      patientId,
      patientPhone: normalizedPhone,
      patientName: args.patientName,
      notes: args.notes,
      source: args.source,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    log.info("Created scheduling request", { requestId, patientId, source: args.source });

    return { requestId, patientId, teamId: args.teamId };
  },
});

/**
 * List scheduling requests for the authenticated user's team.
 */
export const listForTeam = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("scheduled"), v.literal("dismissed")),
    ),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("schedulingRequests.listForTeam");
    const user = await getAuthenticatedUser(ctx);

    let requests;
    if (args.status) {
      requests = await ctx.db
        .query("schedulingRequests")
        .withIndex("by_team_status", (q) =>
          q.eq("teamId", user.teamId).eq("status", args.status!),
        )
        .collect();
    } else {
      requests = await ctx.db
        .query("schedulingRequests")
        .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
        .collect();
    }

    requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    log.debug("Fetched scheduling requests", { count: requests.length, status: args.status });
    return requests;
  },
});

/**
 * Resolve (schedule or dismiss) a scheduling request.
 */
export const resolve = mutation({
  args: {
    requestId: v.id("schedulingRequests"),
    status: v.union(v.literal("scheduled"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("schedulingRequests.resolve", {
      requestId: args.requestId,
    });
    const user = await getAuthenticatedUser(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request || request.teamId !== user.teamId) {
      log.error("Request not found or not in user's team");
      throw new Error("Scheduling request not found");
    }

    if (request.status !== "pending") {
      log.warn("Request already resolved", { currentStatus: request.status });
      throw new Error("This request has already been resolved");
    }

    await ctx.db.patch(args.requestId, {
      status: args.status,
      resolvedAt: new Date().toISOString(),
    });

    log.info("Resolved scheduling request", { requestId: args.requestId, status: args.status });
    return { success: true };
  },
});
