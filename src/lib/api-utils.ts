import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

/**
 * Sanitise error messages before returning them to API clients.
 *
 * Short, single-line messages are assumed to be intentional user-facing
 * strings (e.g. "Patient not found"). Multi-line or stack-trace-like
 * messages are replaced with a generic fallback to avoid leaking
 * database errors, internal URLs, or stack traces.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof Error &&
    error.message &&
    !error.message.includes('\n') &&
    error.message.length < 200
  ) {
    return error.message;
  }
  return fallback;
}

export type AuthenticatedUser = {
  token: string;
  userId: string;
  userEmail: string;
  teamId: string | undefined;
  teamName: string;
  userName: string | undefined;
};

/**
 * Get the authenticated user from the Convex Auth token.
 * Throws if not authenticated or user record is missing.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new AuthError("Not authenticated");
  }

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user || !user.userEmail) {
    throw new AuthError("User not found");
  }

  return {
    token,
    userId: user.userId,
    userEmail: user.userEmail,
    teamId: user.teamId,
    teamName: user.teamName,
    userName: user.userName,
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
