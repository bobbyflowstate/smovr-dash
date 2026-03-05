import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * Get the authenticated user from the Convex Auth identity.
 * Throws if not authenticated or user not found.
 */
export async function getAuthenticatedUser(
  ctx: AuthCtx
): Promise<Doc<"users"> & { teamId: Id<"teams"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db.get(userId);

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
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const user = await ctx.db.get(userId);

  if (!user || !user.teamId) {
    return null;
  }

  return user as Doc<"users"> & { teamId: Id<"teams"> };
}
