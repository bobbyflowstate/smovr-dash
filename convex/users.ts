import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createMutationLogger, createQueryLogger } from "./lib/logger";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function getActiveTeams(ctx: MutationCtx) {
  const teams = await ctx.db.query("teams").collect();
  return teams
    .filter((t) => !t.isArchived)
    .sort((a, b) => a._creationTime - b._creationTime);
}

/**
 * Ensure the authenticated user has a team assigned.
 *
 * Single-team deployment (backward-compatible): auto-assigns the only team.
 * Multi-team deployment: requires ops admin to assign the user first.
 * If no teams exist, creates a default one and assigns it.
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
      const team = await ctx.db.get(user.teamId);
      if (team && team.isArchived) {
        log.error("User's team is archived", { teamId: user.teamId });
        throw new Error("TEAM_ARCHIVED");
      }
      log.debug("User already has a team", { teamId: user.teamId });
      return user._id;
    }

    const activeTeams = await getActiveTeams(ctx);

    if (activeTeams.length === 0) {
      const teamId = await ctx.db.insert("teams", {
        name: process.env.DEFAULT_TEAM_NAME || `${user.name || user.email || "User"}'s Team`,
        contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      });
      await ctx.db.patch(user._id, { teamId, clinicRole: "manager" });
      log.info("Created default team and assigned user", { userId: user._id, teamId });
      return user._id;
    }

    if (activeTeams.length === 1) {
      const teamId = activeTeams[0]._id;
      await ctx.db.patch(user._id, { teamId, clinicRole: "operator" });
      log.info("Auto-assigned user to sole team", { userId: user._id, teamId });
      return user._id;
    }

    log.info("Multiple teams exist; assignment required via /ops", { userId: user._id });
    throw new Error("TEAM_ASSIGNMENT_REQUIRED");
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
        const activeTeams = await getActiveTeams(ctx);
        if (activeTeams.length === 1) {
          await ctx.db.patch(existingUser._id, {
            teamId: activeTeams[0]._id,
            clinicRole: "operator",
          });
        }
      }
      log.debug("Found existing user", { userId: existingUser._id });
      return existingUser._id;
    }

    log.info("Creating new user");
    const activeTeams = await getActiveTeams(ctx);
    let teamId: Id<"teams"> | undefined;
    if (activeTeams.length === 1) {
      teamId = activeTeams[0]._id;
    } else if (activeTeams.length === 0) {
      teamId = await ctx.db.insert("teams", {
        name: process.env.DEFAULT_TEAM_NAME || `${args.name}'s Team`,
        contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      });
    }

    const newUserId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      tokenIdentifier: args.logtoUserId,
      teamId,
      clinicRole: teamId ? "operator" : undefined,
    });

    log.info("Created new user", { userId: newUserId, teamId });
    return newUserId;
  },
});
