import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const WIPE_CONFIRM_TOKEN = "WIPE_DEV_DATA";
const WIPE_PROD_CONFIRM_TOKEN = "WIPE_PROD_DATA";

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
    allowProd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const deployment = process.env.CONVEX_DEPLOYMENT || "";
    if (deployment.startsWith("prod:")) {
      if (!args.allowProd || args.confirm !== WIPE_PROD_CONFIRM_TOKEN) {
        throw new Error(
          "Refusing to wipe production deployment data without allowProd=true and WIPE_PROD_DATA confirmation token."
        );
      }
    } else if (args.confirm !== WIPE_CONFIRM_TOKEN) {
      throw new Error("Refusing to wipe data without the expected confirm token.");
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

function patchDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export const upsertOfficeBootstrap = internalMutation({
  args: {
    team: v.object({
      name: v.string(),
      timezone: v.optional(v.string()),
      hospitalAddress: v.optional(v.string()),
      contactPhone: v.optional(v.string()),
    }),
    smsConfig: v.optional(
      v.object({
        provider: v.union(v.literal("ghl"), v.literal("twilio"), v.literal("mock")),
        isEnabled: v.boolean(),
        webhookUrl: v.optional(v.string()),
        fromNumber: v.optional(v.string()),
        credentialsEnvPrefix: v.optional(v.string()),
        inboundWebhookSecret: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const teams = await ctx.db.query("teams").collect();
    teams.sort((a, b) => a._creationTime - b._creationTime);

    let teamId: Id<"teams">;
    let teamCreated = false;

    if (teams.length === 0) {
      teamId = await ctx.db.insert("teams", {
        name: args.team.name,
        ...patchDefined({
          timezone: args.team.timezone,
          hospitalAddress: args.team.hospitalAddress,
          contactPhone: args.team.contactPhone,
        }),
      });
      teamCreated = true;
    } else {
      teamId = teams[0]._id;
      await ctx.db.patch(
        teamId,
        patchDefined({
          name: args.team.name,
          timezone: args.team.timezone,
          hospitalAddress: args.team.hospitalAddress,
          contactPhone: args.team.contactPhone,
        })
      );
    }

    let smsConfigId: Id<"teamSmsConfig"> | null = null;
    let smsConfigCreated = false;

    if (args.smsConfig) {
      const existing = await ctx.db
        .query("teamSmsConfig")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();

      if (existing.length > 1) {
        throw new Error(
          "Duplicate SMS configuration rows found for team during bootstrap."
        );
      }

      if (existing.length === 1) {
        smsConfigId = existing[0]._id;
        await ctx.db.patch(
          smsConfigId,
          patchDefined({
            provider: args.smsConfig.provider,
            isEnabled: args.smsConfig.isEnabled,
            webhookUrl: args.smsConfig.webhookUrl,
            fromNumber: args.smsConfig.fromNumber,
            credentialsEnvPrefix: args.smsConfig.credentialsEnvPrefix,
            inboundWebhookSecret: args.smsConfig.inboundWebhookSecret,
          })
        );
      } else {
        smsConfigId = await ctx.db.insert("teamSmsConfig", {
          teamId,
          provider: args.smsConfig.provider,
          isEnabled: args.smsConfig.isEnabled,
          ...patchDefined({
            webhookUrl: args.smsConfig.webhookUrl,
            fromNumber: args.smsConfig.fromNumber,
            credentialsEnvPrefix: args.smsConfig.credentialsEnvPrefix,
            inboundWebhookSecret: args.smsConfig.inboundWebhookSecret,
          }),
        });
        smsConfigCreated = true;
      }
    }

    return {
      teamId,
      teamCreated,
      smsConfigId,
      smsConfigCreated,
      existingTeamsDetected: teams.length,
    };
  },
});
