import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

// New app-layer authentication approach
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

    // Check if user already exists by email
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      log.debug("Found existing user", { userId: existingUser._id });
      return existingUser._id;
    }

    log.info("Creating new user");
    
    // Create a new team for the new user
    const teamId = await ctx.db.insert("teams", {
      name: `${args.name}'s Team`,
      contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      timezone: process.env.APPOINTMENT_TIMEZONE,
      hospitalAddress: process.env.HOSPITAL_ADDRESS,
    });

    // Create the new user
    const newUserId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      tokenIdentifier: args.logtoUserId, // Store Logto user ID for reference
      teamId,
    });

    log.info("Created new user and team", { userId: newUserId, teamId });
    return newUserId;
  },
});

export const getUserWithTeam = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("users.getUserWithTeam", { userEmail: args.userEmail });
    log.debug("Getting user and team info");

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.debug("User not found in database");
      return null;
    }

    // Get team information
    const team = await ctx.db.get(user.teamId);

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

// Legacy JWT-based mutation (keeping for now but not used)
export const getOrCreateUser = mutation({
  handler: async (ctx) => {
    const log = createMutationLogger("users.getOrCreateUser");
    
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      log.error("User identity not found");
      throw new Error("User identity not found. Make sure you are logged in.");
    }

    log.debug("Looking for user by token", { tokenIdentifier: identity.tokenIdentifier });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (user !== null) {
      log.debug("Found existing user", { userId: user._id });
      return user._id;
    }

    log.info("Creating new user from identity");

    // Create a new team for the new user
    const teamId = await ctx.db.insert("teams", {
      name: `${identity.name}'s Team`,
      contactPhone: process.env.DEFAULT_TEAM_CONTACT_PHONE,
      timezone: process.env.APPOINTMENT_TIMEZONE,
      hospitalAddress: process.env.HOSPITAL_ADDRESS,
    });

    // Create the new user
    const newUserId = await ctx.db.insert("users", {
      name: identity.name!,
      email: identity.email!,
      tokenIdentifier: identity.tokenIdentifier,
      teamId,
    });

    log.info("Created new user and team", { userId: newUserId, teamId });
    return newUserId;
  },
});
