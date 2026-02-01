/**
 * SMS Configuration Convex Functions
 * 
 * Manages per-team SMS provider settings.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger, createMutationLogger } from "./lib/logger";

/**
 * Get SMS configuration for a team
 */
export const getByTeamId = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("smsConfig.getByTeamId", { teamId: args.teamId });
    
    const config = await ctx.db
      .query("teamSmsConfig")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
    
    log.debug("Fetched SMS config", { found: !!config });
    return config;
  },
});

/**
 * Get SMS configuration for the current user's team
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
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.warn("User not found");
      return null;
    }
    
    const config = await ctx.db
      .query("teamSmsConfig")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .first();
    
    log.debug("Fetched SMS config for user", { found: !!config, teamId: user.teamId });
    return config;
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
      v.literal("vonage"),
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
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      throw new Error("User not found");
    }
    
    const teamId = user.teamId;
    
    // Check for existing config
    const existing = await ctx.db
      .query("teamSmsConfig")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    
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
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      throw new Error("User not found");
    }
    
    const config = await ctx.db
      .query("teamSmsConfig")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .first();
    
    if (!config) {
      log.error("SMS config not found for team");
      throw new Error("SMS configuration not found. Please set up SMS first.");
    }
    
    await ctx.db.patch(config._id, { isEnabled: args.isEnabled });
    log.info("Updated SMS enabled status");
  },
});

