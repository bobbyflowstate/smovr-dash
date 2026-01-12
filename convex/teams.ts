import { query } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});


