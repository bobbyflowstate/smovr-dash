import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WIPE_CONFIRM_TOKEN = "WIPE_DEV_DATA";

export const clearTable = internalMutation({
  args: {
    table: v.union(
      v.literal("users"),
      v.literal("teams"),
      v.literal("patients"),
      v.literal("appointments"),
      v.literal("reminders"),
      v.literal("reminderAttempts"),
      v.literal("logs"),
      v.literal("messages"),
      v.literal("conversations"),
      v.literal("messageTemplates"),
      v.literal("teamSmsConfig"),
      v.literal("authAccounts"),
      v.literal("authSessions"),
      v.literal("authRefreshTokens"),
      v.literal("authVerificationCodes"),
      v.literal("authVerifiers")
    ),
    batchSize: v.optional(v.number()),
    confirm: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== WIPE_CONFIRM_TOKEN) {
      throw new Error("Refusing to wipe data without the expected confirm token.");
    }

    const deployment = process.env.CONVEX_DEPLOYMENT || "";
    if (deployment.startsWith("prod:")) {
      throw new Error("Refusing to wipe production deployment data.");
    }

    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 1000);
    const docs = await ctx.db.query(args.table).take(batchSize);

    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }

    return {
      table: args.table,
      deleted: docs.length,
    };
  },
});
