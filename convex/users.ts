import { mutation } from "./_generated/server";
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
