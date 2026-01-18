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
