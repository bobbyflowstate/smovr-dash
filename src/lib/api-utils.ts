import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { getSMSProviderForTeam, getDefaultSMSProvider, type SMSProvider } from "@/lib/sms";
import type { AdminConvexClient } from "@/lib/convex-server";
import type { Id } from "../../convex/_generated/dataModel";

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

/** True when an error payload indicates request throttling/rate limiting. */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error && /too many requests/i.test(error.message)) {
    return true;
  }

  try {
    const serialized =
      typeof error === "string" ? error : JSON.stringify(error);
    return /too many requests/i.test(serialized);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phone normalization
// ---------------------------------------------------------------------------

/** Strip all non-digit characters from a phone string. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// IP rate limiter (in-memory, per server instance)
// Resets on deploy — first line of defense, not the only one.
// ---------------------------------------------------------------------------

const IP_WINDOW_MS = 60_000; // 1 minute
const IP_MAX_REQUESTS = 10;
const ipHits = new Map<string, number[]>();

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > IP_MAX_REQUESTS;
}

/** Extract client IP from the request. */
export function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

/**
 * Apply IP rate limiting. Returns a 429 Response if the IP has exceeded
 * the limit, or `null` if the request should be allowed through.
 */
export function applyIpRateLimit(ip: string): NextResponse | null {
  if (isIpRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }
  return null;
}

/**
 * Check the honeypot field. Returns `true` if a bot filled it in
 * (caller should return a fake-success response).
 */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  return Boolean(body._hp);
}

// ---------------------------------------------------------------------------
// SMS provider resolution
// ---------------------------------------------------------------------------

/** Resolve the SMS provider for a team, falling back to the default. */
export async function resolveSMSProvider(
  convex: AdminConvexClient,
  teamId: Id<"teams">,
): Promise<SMSProvider> {
  const provider = await getSMSProviderForTeam(convex, teamId);
  return provider ?? getDefaultSMSProvider();
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
