/**
 * Message Templates Convex Functions
 * 
 * Manages quick reply templates for two-way SMS messaging.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger, createMutationLogger } from "./lib/logger";

// ============================================
// Queries
// ============================================

/**
 * Get all active templates for the current user's team
 */
export const getActiveTemplates = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("messageTemplates.getActiveTemplates", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.warn("User not found or no team");
      return [];
    }
    const teamId = user.teamId;
    
    // Get active templates, sorted by sortOrder
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Sort by sortOrder
    const sorted = templates.sort((a, b) => a.sortOrder - b.sortOrder);
    
    log.debug("Fetched active templates", { count: sorted.length });
    return sorted;
  },
});

/**
 * Get all templates for the current user's team (including inactive)
 */
export const getAllTemplates = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("messageTemplates.getAllTemplates", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.warn("User not found or no team");
      return [];
    }
    const teamId = user.teamId;
    
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    
    // Sort by sortOrder
    const sorted = templates.sort((a, b) => a.sortOrder - b.sortOrder);
    
    log.debug("Fetched all templates", { count: sorted.length });
    return sorted;
  },
});

// ============================================
// Mutations
// ============================================

/**
 * Create a new message template
 */
export const create = mutation({
  args: {
    userEmail: v.string(),
    name: v.string(),
    body: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messageTemplates.create", { 
      userEmail: args.userEmail,
      name: args.name,
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
    
    // Get current max sortOrder
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    
    const maxSortOrder = templates.reduce((max, t) => Math.max(max, t.sortOrder), -1);
    
    const templateId = await ctx.db.insert("messageTemplates", {
      teamId,
      name: args.name,
      body: args.body,
      category: args.category,
      sortOrder: maxSortOrder + 1,
      isActive: true,
    });
    
    log.info("Created template", { templateId });
    return templateId;
  },
});

/**
 * Update an existing template
 */
export const update = mutation({
  args: {
    userEmail: v.string(),
    templateId: v.id("messageTemplates"),
    name: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messageTemplates.update", { 
      userEmail: args.userEmail,
      templateId: args.templateId,
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
    
    // Verify template belongs to user's team
    const template = await ctx.db.get(args.templateId);
    if (!template || template.teamId !== teamId) {
      log.error("Template not found or not in user's team");
      throw new Error("Template not found");
    }
    
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.body !== undefined) updates.body = args.body;
    if (args.category !== undefined) updates.category = args.category;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    
    await ctx.db.patch(args.templateId, updates);
    
    log.info("Updated template");
  },
});

/**
 * Delete a template
 */
export const remove = mutation({
  args: {
    userEmail: v.string(),
    templateId: v.id("messageTemplates"),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messageTemplates.remove", { 
      userEmail: args.userEmail,
      templateId: args.templateId,
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
    
    // Verify template belongs to user's team
    const template = await ctx.db.get(args.templateId);
    if (!template || template.teamId !== teamId) {
      log.error("Template not found or not in user's team");
      throw new Error("Template not found");
    }
    
    await ctx.db.delete(args.templateId);
    
    log.info("Deleted template");
  },
});

/**
 * Seed default templates for a team (called on first setup)
 */
export const seedDefaults = mutation({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messageTemplates.seedDefaults", { userEmail: args.userEmail });
    
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
    
    // Check if team already has templates
    const existing = await ctx.db
      .query("messageTemplates")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    
    if (existing) {
      log.info("Team already has templates, skipping seed");
      return;
    }
    
    // Default templates
    const defaults = [
      {
        name: "Running Late - No Problem",
        body: "No problem! We'll see you when you arrive. Take your time and drive safely.",
        category: "Scheduling",
        sortOrder: 0,
      },
      {
        name: "Confirm Appointment",
        body: "Hi {{patientName}}, please reply YES to confirm your appointment on {{appointmentDate}} at {{appointmentTime}}.",
        category: "Reminders",
        sortOrder: 1,
      },
      {
        name: "Reschedule Request",
        body: "Hi {{patientName}}, we received your request to reschedule. Please call us at your earliest convenience to find a new time that works for you.",
        category: "Scheduling",
        sortOrder: 2,
      },
      {
        name: "Thank You",
        body: "Thank you for visiting us today! If you have any questions about your visit, please don't hesitate to reach out.",
        category: "General",
        sortOrder: 3,
      },
      {
        name: "Office Hours",
        body: "Our office hours are Monday-Friday 8:00 AM - 5:00 PM. We're happy to help during these hours.",
        category: "General",
        sortOrder: 4,
      },
    ];
    
    for (const template of defaults) {
      await ctx.db.insert("messageTemplates", {
        teamId,
        name: template.name,
        body: template.body,
        category: template.category,
        sortOrder: template.sortOrder,
        isActive: true,
      });
    }
    
    log.info("Seeded default templates", { count: defaults.length });
  },
});

