import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createMutationLogger, createQueryLogger } from "./lib/logger";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function getOldestTeamId(ctx: MutationCtx): Promise<Id<"teams"> | null> {
  const teams = await ctx.db.query("teams").collect();
  if (teams.length === 0) return null;
  teams.sort((a, b) => a._creationTime - b._creationTime);
  return teams[0]._id;
}

async function getOrCreatePrimaryTeamId(
  ctx: MutationCtx,
  fallbackName: string
): Promise<Id<"teams">> {
  const existingTeamId = await getOldestTeamId(ctx);
  if (existingTeamId) return existingTeamId;

  return await ctx.db.insert("teams", {
    name: process.env.DEFAULT_TEAM_NAME || fallbackName,
    contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
    timezone: process.env.APPOINTMENT_TIMEZONE,
    hospitalAddress: process.env.HOSPITAL_ADDRESS,
  });
}

/**
 * Ensure the authenticated user has a team assigned.
 * If the user exists but has no team, assigns the oldest existing team.
 * If no teams exist, creates one and assigns it.
 * Called post-login from the frontend.
 */
export const ensureTeam = mutation({
  args: {},
  handler: async (ctx) => {
    const log = createMutationLogger("users.ensureTeam");

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      log.error("Not authenticated");
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      log.error("User not found in database", { userId });
      throw new Error("User not found");
    }

    if (user.teamId) {
      log.debug("User already has a team", { teamId: user.teamId });
      return user._id;
    }

    const teamId = await getOrCreatePrimaryTeamId(
      ctx,
      `${user.name || user.email || "User"}'s Team`
    );

    await ctx.db.patch(user._id, { teamId });

    log.info("Assigned team to user", { userId: user._id, teamId });
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

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      log.debug("User not found in database", { userId });
      return null;
    }

    const teamId = user.teamId;
    const team = teamId ? await ctx.db.get(teamId) : null;

    log.debug("Found user with team", { userId: user._id, teamId });
    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      teamId,
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

    const teamId = user.teamId;
    const team = teamId ? await ctx.db.get(teamId) : null;

    log.debug("Found user with team", { userId: user._id, teamId });
    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      teamId,
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
      if (!existingUser.teamId) {
        const teamId = await getOrCreatePrimaryTeamId(ctx, `${args.name}'s Team`);
        await ctx.db.patch(existingUser._id, { teamId });
      }
      log.debug("Found existing user", { userId: existingUser._id });
      return existingUser._id;
    }

    log.info("Creating new user");
    const teamId = await getOrCreatePrimaryTeamId(ctx, `${args.name}'s Team`);

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
