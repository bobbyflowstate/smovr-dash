import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * Get the authenticated user from the Convex Auth identity.
 * Throws if not authenticated or user not found.
 */
export async function getAuthenticatedUser(
  ctx: AuthCtx
): Promise<Doc<"users"> & { teamId: Id<"teams"> }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email!))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.teamId) {
    throw new Error("User has no team assigned");
  }

  return user as Doc<"users"> & { teamId: Id<"teams"> };
}

/**
 * Try to get the authenticated user. Returns null if not authenticated.
 */
export async function tryGetAuthenticatedUser(
  ctx: AuthCtx
): Promise<(Doc<"users"> & { teamId: Id<"teams"> }) | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    return null;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email!))
    .unique();

  if (!user || !user.teamId) {
    return null;
  }

  return user as Doc<"users"> & { teamId: Id<"teams"> };
}
