import { NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { internal } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { getAuthenticatedUser, AuthError, safeErrorMessage } from "@/lib/api-utils";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";

/**
 * POST /api/reactivation — Send reactivation messages to selected patients
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "POST",
    route: "reactivation.send",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token, teamId } = await getAuthenticatedUser();

      if (!teamId) {
        return NextResponse.json({ error: "No team found" }, { status: 400 });
      }

      const body = await request.json();
      const { patientIds } = body as { patientIds?: string[] };

      if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
        return NextResponse.json({ error: "patientIds array is required" }, { status: 400 });
      }

      if (patientIds.length > 100) {
        return NextResponse.json({ error: "Maximum 100 patients per batch" }, { status: 400 });
      }

      log.info("Sending reactivation messages", { count: patientIds.length, teamId });

      const result = await fetchAction(
        internal.proReminders.sendReactivationMessages,
        {
          teamId: teamId as Id<"teams">,
          patientIds: patientIds as Id<"patients">[],
        },
        { token },
      );

      log.info("Reactivation send complete", { sent: result.sent, failed: result.failed });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      log.error("Failed to send reactivation messages", error);
      return NextResponse.json(
        { error: safeErrorMessage(error, "Failed to send reactivation messages") },
        { status: 500 },
      );
    }
  });
}
