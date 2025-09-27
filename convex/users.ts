import { mutation } from "./_generated/server";

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
