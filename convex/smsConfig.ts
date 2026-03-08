/**
 * SMS Configuration Convex Functions
 * 
 * Manages per-team SMS provider settings.
 */

import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger, createMutationLogger } from "./lib/logger";

async function getTeamConfigs(ctx: any, teamId: any) {
  return await ctx.db
    .query("teamSmsConfig")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .collect();
}

/**
 * Get SMS configuration for a team.
 * Internal-only: called from server-side code (webhook handler, provider factory).
 */
export const getByTeamId = internalQuery({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("smsConfig.getByTeamId", { teamId: args.teamId });
    const configs = await getTeamConfigs(ctx, args.teamId);
    if (configs.length > 1) {
      log.error("Duplicate SMS configs for team", { count: configs.length });
      throw new Error("Duplicate SMS configuration rows found for team.");
    }
    const config = configs[0] ?? null;
    
    log.debug("Fetched SMS config", { found: !!config });
    return config;
  },
});

/**
 * Get SMS configuration for the current user's team.
 * Secrets (inboundWebhookSecret) are redacted — only a boolean flag is exposed.
 */
export const getForCurrentUser = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("smsConfig.getForCurrentUser", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.warn("User not found or no team");
      return null;
    }
    const teamId = user.teamId;
    
    const configs = await getTeamConfigs(ctx, teamId);
    if (configs.length > 1) {
      log.error("Duplicate SMS configs for team", { teamId, count: configs.length });
      throw new Error("Duplicate SMS configuration rows found for team.");
    }
    const config = configs[0] ?? null;
    
    if (!config) {
      log.debug("No SMS config for user", { teamId });
      return null;
    }

    log.debug("Fetched SMS config for user", { found: true, teamId });

    // Redact secrets — clients only need to know whether a secret is configured
    const { inboundWebhookSecret, ...safe } = config;
    return {
      ...safe,
      hasWebhookSecret: !!inboundWebhookSecret,
    };
  },
});

/**
 * Create or update SMS configuration for a team
 */
export const upsert = mutation({
  args: {
    userEmail: v.string(),
    provider: v.union(
      v.literal("ghl"),
      v.literal("twilio"),
      v.literal("mock")
    ),
    isEnabled: v.boolean(),
    fromNumber: v.optional(v.string()),
    webhookUrl: v.optional(v.string()),
    credentialsEnvPrefix: v.optional(v.string()),
    inboundWebhookSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("smsConfig.upsert", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.error("User not found or no team");
      throw new Error("User not found");
    }
    
    const teamId = user.teamId;
    
    // Check for existing config
    const configs = await getTeamConfigs(ctx, teamId);
    if (configs.length > 1) {
      log.error("Duplicate SMS configs for team", { teamId, count: configs.length });
      throw new Error("Duplicate SMS configuration rows found for team.");
    }
    const existing = configs[0] ?? null;
    
    const configData = {
      teamId,
      provider: args.provider,
      isEnabled: args.isEnabled,
      fromNumber: args.fromNumber,
      webhookUrl: args.webhookUrl,
      credentialsEnvPrefix: args.credentialsEnvPrefix,
      inboundWebhookSecret: args.inboundWebhookSecret,
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, configData);
      log.info("Updated SMS config", { configId: existing._id });
      return existing._id;
    } else {
      const configId = await ctx.db.insert("teamSmsConfig", configData);
      log.info("Created SMS config", { configId });
      return configId;
    }
  },
});

/**
 * Enable or disable SMS for a team
 */
export const setEnabled = mutation({
  args: {
    userEmail: v.string(),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("smsConfig.setEnabled", { 
      userEmail: args.userEmail, 
      isEnabled: args.isEnabled 
    });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.error("User not found or no team");
      throw new Error("User not found");
    }
    const teamId = user.teamId;
    
    const configs = await getTeamConfigs(ctx, teamId);
    if (configs.length > 1) {
      log.error("Duplicate SMS configs for team", { teamId, count: configs.length });
      throw new Error("Duplicate SMS configuration rows found for team.");
    }
    const config = configs[0] ?? null;
    
    if (!config) {
      log.error("SMS config not found for team");
      throw new Error("SMS configuration not found. Please set up SMS first.");
    }
    
    await ctx.db.patch(config._id, { isEnabled: args.isEnabled });
    log.info("Updated SMS enabled status");
  },
});
