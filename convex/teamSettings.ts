import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./lib/auth";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const log = createQueryLogger("teamSettings.get");
    const user = await getAuthenticatedUser(ctx);
    const team = await ctx.db.get(user.teamId);
    if (!team) {
      log.error("Team not found", { teamId: user.teamId });
      throw new Error("Team not found");
    }
    log.debug("Fetched team settings", { teamId: team._id });
    return {
      _id: team._id,
      name: team.name,
      contactPhone: team.contactPhone,
      timezone: team.timezone,
      hospitalAddress: team.hospitalAddress,
      languageMode: team.languageMode ?? "en_es",
      rescheduleUrl: team.rescheduleUrl,
      entrySlug: team.entrySlug,
    };
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    timezone: v.optional(v.string()),
    hospitalAddress: v.optional(v.string()),
    languageMode: v.optional(v.union(v.literal("en"), v.literal("en_es"))),
    rescheduleUrl: v.optional(v.string()),
    entrySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("teamSettings.update");
    const user = await getAuthenticatedUser(ctx);
    const teamId = user.teamId;

    const team = await ctx.db.get(teamId);
    if (!team) {
      log.error("Team not found", { teamId });
      throw new Error("Team not found");
    }

    if (args.entrySlug !== undefined && args.entrySlug !== team.entrySlug) {
      const existing = await ctx.db
        .query("teams")
        .filter((q) => q.eq(q.field("entrySlug"), args.entrySlug))
        .first();
      if (existing && existing._id !== teamId) {
        throw new Error("This entry slug is already in use by another team");
      }
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.contactPhone !== undefined) updates.contactPhone = args.contactPhone || undefined;
    if (args.timezone !== undefined) updates.timezone = args.timezone || undefined;
    if (args.hospitalAddress !== undefined) updates.hospitalAddress = args.hospitalAddress || undefined;
    if (args.languageMode !== undefined) updates.languageMode = args.languageMode;
    if (args.rescheduleUrl !== undefined) updates.rescheduleUrl = args.rescheduleUrl || undefined;
    if (args.entrySlug !== undefined) updates.entrySlug = args.entrySlug || undefined;

    await ctx.db.patch(teamId, updates);
    log.info("Updated team settings", { teamId, fields: Object.keys(updates) });

    return { success: true };
  },
});
