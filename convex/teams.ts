import { query } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger } from "./lib/logger";

export const getById = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const log = createQueryLogger("teams.getById", { teamId: args.teamId });
    const team = await ctx.db.get(args.teamId);
    log.debug("Fetched team", { found: !!team });
    return team;
  },
});

export const getByEntrySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const log = createQueryLogger("teams.getByEntrySlug", { slug: args.slug });
    const team = await ctx.db
      .query("teams")
      .filter((q) => q.eq(q.field("entrySlug"), args.slug))
      .first();
    log.debug("Fetched team by slug", { found: !!team });
    return team;
  },
});
