/**
 * Server-side Convex admin client.
 *
 * Uses CONVEX_DEPLOY_KEY to authenticate, which allows calling
 * internalMutation / internalQuery / internalAction from Next.js
 * API routes and server utilities.
 */

import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";

// ---------------------------------------------------------------------------
// setAdminAuth exists on ConvexHttpClient but is excluded from the public
// type declarations (@internal).  Augment the type so the factory below
// doesn't need `as any`.
// ---------------------------------------------------------------------------
declare module "convex/browser" {
  interface ConvexHttpClient {
    setAdminAuth(token: string, actingAsIdentity?: Record<string, unknown>): void;
  }
}

// ---------------------------------------------------------------------------
// AdminConvexClient
//
// An intersection of ConvexHttpClient with overloaded signatures that also
// accept *internal* function references.  Using an intersection (instead of
// `extends`) produces true method overloads in TypeScript:
//
//   • Public `api.*` calls resolve to the ConvexHttpClient signatures.
//   • Internal `internal.*` calls resolve to the InternalCallOverloads.
//   • The type is assignable to ConvexHttpClient, so existing helpers
//     like getSMSProviderForTeam accept it without any changes.
//
// The single narrowing cast lives inside createAdminConvexClient().
// ---------------------------------------------------------------------------

interface InternalCallOverloads {
  query<Query extends FunctionReference<"query", "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>>;

  mutation<Mutation extends FunctionReference<"mutation", "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;

  action<Action extends FunctionReference<"action", "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>>;
}

export type AdminConvexClient = ConvexHttpClient & InternalCallOverloads;

/**
 * Create a ConvexHttpClient with admin auth so it can call internal functions.
 *
 * Returns an {@link AdminConvexClient} whose methods accept both `api.*` and
 * `internal.*` function references with full type safety.
 *
 * Requires the CONVEX_URL and CONVEX_DEPLOY_KEY environment variables.
 */
export function createAdminConvexClient(): AdminConvexClient {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL environment variable is not set");
  }

  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error(
      "CONVEX_DEPLOY_KEY environment variable is not set — required for server-to-Convex internal calls"
    );
  }

  const client = new ConvexHttpClient(url);
  client.setAdminAuth(deployKey);

  // The runtime object is a standard ConvexHttpClient — admin auth makes
  // internal calls succeed.  The cast only widens the *type* so callers
  // can pass internal function references without `as any`.
  return client as AdminConvexClient;
}
