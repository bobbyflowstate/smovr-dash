import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

/**
 * Ensure the authenticated user has a team assigned.
 * If the user exists but has no team, creates one.
 * Called post-login from the frontend.
 */
export const ensureTeam = mutation({
  args: {},
  handler: async (ctx) => {
    const log = createMutationLogger("users.ensureTeam");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      log.error("Not authenticated");
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      log.error("User not found in database");
      throw new Error("User not found");
    }

    if (user.teamId) {
      log.debug("User already has a team", { teamId: user.teamId });
      return user._id;
    }

    log.info("Creating team for user");

    const teamId = await ctx.db.insert("teams", {
      name: `${user.name || identity.name || "User"}'s Team`,
      contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      timezone: process.env.APPOINTMENT_TIMEZONE,
      hospitalAddress: process.env.HOSPITAL_ADDRESS,
    });

    await ctx.db.patch(user._id, { teamId });

    log.info("Created team for user", { userId: user._id, teamId });
    return user._id;
  },
});

/**
 * Get the currently authenticated user's info with team.
 * Uses ctx.auth.getUserIdentity() -- requires an auth token.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const log = createQueryLogger("users.currentUser");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      log.debug("User not found in database");
      return null;
    }

    const team = user.teamId ? await ctx.db.get(user.teamId) : null;

    log.debug("Found user with team", { userId: user._id, teamId: user.teamId });
    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      teamId: user.teamId,
      teamName: team?.name || "Unknown Team",
    };
  },
});

export const getUserWithTeam = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("users.getUserWithTeam", { userEmail: args.userEmail });
    log.debug("Getting user and team info");

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.debug("User not found in database");
      return null;
    }

    const team = user.teamId ? await ctx.db.get(user.teamId) : null;

    log.debug("Found user with team", { userId: user._id, teamId: user.teamId });
    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      teamId: user.teamId,
      teamName: team?.name || "Unknown Team"
    };
  },
});

/**
 * Legacy: kept for backward compatibility during migration.
 * New auth flow uses Convex Auth's built-in user creation.
 */
export const getOrCreateUserByEmail = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    logtoUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("users.getOrCreateUserByEmail", { 
      email: args.email,
      logtoUserId: args.logtoUserId,
    });
    log.debug("Looking for user");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      log.debug("Found existing user", { userId: existingUser._id });
      return existingUser._id;
    }

    log.info("Creating new user");
    
    const teamId = await ctx.db.insert("teams", {
      name: `${args.name}'s Team`,
      contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      timezone: process.env.APPOINTMENT_TIMEZONE,
      hospitalAddress: process.env.HOSPITAL_ADDRESS,
    });

    const newUserId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      tokenIdentifier: args.logtoUserId,
      teamId,
    });

    log.info("Created new user and team", { userId: newUserId, teamId });
    return newUserId;
  },
});
