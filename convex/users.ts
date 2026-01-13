import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// New app-layer authentication approach
export const getOrCreateUserByEmail = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    logtoUserId: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("getOrCreateUserByEmail: Looking for user with email:", args.email);

    // Check if user already exists by email
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      console.log("getOrCreateUserByEmail: Found existing user:", existingUser._id);
      return existingUser._id;
    }

    console.log("getOrCreateUserByEmail: Creating new user");
    
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

    console.log("getOrCreateUserByEmail: Created new user:", newUserId);
    return newUserId;
  },
});

export const getUserWithTeam = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("getUserWithTeam: Getting user and team info for:", args.userEmail);

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      console.log("getUserWithTeam: User not found in database");
      return null;
    }

    // Get team information
    const team = await ctx.db.get(user.teamId);

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
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("User identity not found. Make sure you are logged in.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (user !== null) {
      return user._id;
    }

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

    return newUserId;
  },
});
