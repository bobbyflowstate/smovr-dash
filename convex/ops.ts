import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const listTeams = internalQuery({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allTeams = await ctx.db.query("teams").collect();

    const teams = args.includeArchived
      ? allTeams
      : allTeams.filter((t) => !t.isArchived);

    const results = [];
    for (const team of teams) {
      const smsConfig = await ctx.db
        .query("teamSmsConfig")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .first();

      const userCount = (
        await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("teamId"), team._id))
          .collect()
      ).length;

      results.push({
        _id: team._id,
        name: team.name,
        entrySlug: team.entrySlug,
        timezone: team.timezone,
        contactPhone: team.contactPhone,
        languageMode: team.languageMode,
        features: team.features,
        isArchived: team.isArchived,
        smsProvider: smsConfig?.provider ?? null,
        smsEnabled: smsConfig?.isEnabled ?? false,
        userCount,
      });
    }

    return results;
  },
});

export const getTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;

    const smsConfig = await ctx.db
      .query("teamSmsConfig")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .first();

    return {
      ...team,
      smsConfig: smsConfig
        ? {
            _id: smsConfig._id,
            provider: smsConfig.provider,
            isEnabled: smsConfig.isEnabled,
            fromNumber: smsConfig.fromNumber,
            webhookUrl: smsConfig.webhookUrl,
            credentialsEnvPrefix: smsConfig.credentialsEnvPrefix,
            hasInboundSecret: !!smsConfig.inboundWebhookSecret,
          }
        : null,
    };
  },
});

export const createTeam = internalMutation({
  args: {
    name: v.string(),
    contactPhone: v.optional(v.string()),
    timezone: v.optional(v.string()),
    hospitalAddress: v.optional(v.string()),
    languageMode: v.optional(v.union(v.literal("en"), v.literal("en_es"))),
    rescheduleUrl: v.optional(v.string()),
    entrySlug: v.optional(v.string()),
    features: v.optional(v.record(v.string(), v.boolean())),
    smsConfig: v.optional(
      v.object({
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
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.entrySlug) {
      const normalized = args.entrySlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!normalized) {
        throw new Error("Entry slug must contain only letters, numbers, and hyphens.");
      }
      const existing = await ctx.db
        .query("teams")
        .filter((q) => q.eq(q.field("entrySlug"), normalized))
        .first();
      if (existing) {
        throw new Error("This entry slug is already in use by another team.");
      }
    }

    const teamId = await ctx.db.insert("teams", {
      name: args.name,
      contactPhone: args.contactPhone,
      timezone: args.timezone,
      hospitalAddress: args.hospitalAddress,
      languageMode: args.languageMode,
      rescheduleUrl: args.rescheduleUrl,
      entrySlug: args.entrySlug
        ? args.entrySlug.toLowerCase().replace(/[^a-z0-9-]/g, "")
        : undefined,
      features: args.features,
    });

    let smsConfigId: Id<"teamSmsConfig"> | null = null;
    if (args.smsConfig) {
      smsConfigId = await ctx.db.insert("teamSmsConfig", {
        teamId,
        provider: args.smsConfig.provider,
        isEnabled: args.smsConfig.isEnabled,
        fromNumber: args.smsConfig.fromNumber,
        webhookUrl: args.smsConfig.webhookUrl,
        credentialsEnvPrefix: args.smsConfig.credentialsEnvPrefix,
        inboundWebhookSecret: args.smsConfig.inboundWebhookSecret,
      });
    }

    return { teamId, smsConfigId };
  },
});

export const updateTeam = internalMutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    timezone: v.optional(v.string()),
    hospitalAddress: v.optional(v.string()),
    languageMode: v.optional(v.union(v.literal("en"), v.literal("en_es"))),
    rescheduleUrl: v.optional(v.string()),
    entrySlug: v.optional(v.string()),
    features: v.optional(v.record(v.string(), v.boolean())),
    smsConfig: v.optional(
      v.object({
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    if (args.entrySlug !== undefined && args.entrySlug !== team.entrySlug) {
      const normalized = args.entrySlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (args.entrySlug && !normalized) {
        throw new Error("Entry slug must contain only letters, numbers, and hyphens.");
      }
      if (normalized) {
        const existing = await ctx.db
          .query("teams")
          .filter((q) => q.eq(q.field("entrySlug"), normalized))
          .first();
        if (existing && existing._id !== args.teamId) {
          throw new Error("This entry slug is already in use by another team.");
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.contactPhone !== undefined) updates.contactPhone = args.contactPhone || undefined;
    if (args.timezone !== undefined) updates.timezone = args.timezone || undefined;
    if (args.hospitalAddress !== undefined) updates.hospitalAddress = args.hospitalAddress || undefined;
    if (args.languageMode !== undefined) updates.languageMode = args.languageMode;
    if (args.rescheduleUrl !== undefined) updates.rescheduleUrl = args.rescheduleUrl || undefined;
    if (args.entrySlug !== undefined) {
      updates.entrySlug = args.entrySlug
        ? args.entrySlug.toLowerCase().replace(/[^a-z0-9-]/g, "")
        : undefined;
    }
    if (args.features !== undefined) updates.features = args.features;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.teamId, updates);
    }

    if (args.smsConfig) {
      const existing = await ctx.db
        .query("teamSmsConfig")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .first();

      const smsData = {
        provider: args.smsConfig.provider,
        isEnabled: args.smsConfig.isEnabled,
        fromNumber: args.smsConfig.fromNumber,
        webhookUrl: args.smsConfig.webhookUrl,
        credentialsEnvPrefix: args.smsConfig.credentialsEnvPrefix,
        inboundWebhookSecret: args.smsConfig.inboundWebhookSecret,
      };

      if (existing) {
        await ctx.db.patch(existing._id, smsData);
      } else {
        await ctx.db.insert("teamSmsConfig", { teamId: args.teamId, ...smsData });
      }
    }

    return { success: true };
  },
});

export const archiveTeam = internalMutation({
  args: {
    teamId: v.id("teams"),
    archivedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await ctx.db.patch(args.teamId, {
      isArchived: true,
      archivedAt: new Date().toISOString(),
      archivedBy: args.archivedBy,
    });

    return { success: true };
  },
});

export const restoreTeam = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await ctx.db.patch(args.teamId, {
      isArchived: false,
      archivedAt: undefined,
      archivedBy: undefined,
    });

    return { success: true };
  },
});

export const listTeamUsers = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .collect();

    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      clinicRole: u.clinicRole,
    }));
  },
});

export const assignUserToTeam = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    clinicRole: v.optional(v.union(v.literal("operator"), v.literal("manager"))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    if (team.isArchived) throw new Error("Cannot assign user to archived team");

    await ctx.db.patch(args.userId, {
      teamId: args.teamId,
      clinicRole: args.clinicRole ?? "operator",
    });

    return { success: true };
  },
});

export const updateClinicUserRole = internalMutation({
  args: {
    userId: v.id("users"),
    clinicRole: v.union(v.literal("operator"), v.literal("manager")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, { clinicRole: args.clinicRole });

    return { success: true };
  },
});

export const unassignUserFromTeam = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, {
      teamId: undefined,
      clinicRole: undefined,
    });

    return { success: true };
  },
});

export const listAllUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      teamId: u.teamId,
      clinicRole: u.clinicRole,
    }));
  },
});
