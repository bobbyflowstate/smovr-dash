import { NextRequest, NextResponse } from "next/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api, internal } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { getAuthenticatedUser, AuthError, safeErrorMessage } from "@/lib/api-utils";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";
import { fetchAction } from "convex/nextjs";

/**
 * GET /api/referrals?patientId=xxx — List referrals for a patient
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "GET",
    route: "referrals.list",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token, userEmail } = await getAuthenticatedUser();
      const patientId = request.nextUrl.searchParams.get("patientId");

      if (!patientId) {
        return NextResponse.json({ error: "patientId is required" }, { status: 400 });
      }

      log.info("Fetching referrals", { patientId });
      const referrals = await fetchQuery(
        api.referrals.listForPatient,
        { userEmail, patientId: patientId as Id<"patients"> },
        { token },
      );

      return NextResponse.json(referrals);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      log.error("Failed to fetch referrals", error);
      return NextResponse.json({ error: safeErrorMessage(error, "Failed to fetch referrals") }, { status: 500 });
    }
  });
}

/**
 * POST /api/referrals — Create a new referral and optionally send immediate follow-up
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "POST",
    route: "referrals.create",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token, userEmail } = await getAuthenticatedUser();
      const body = await request.json();
      const { patientId, referralName, referralAddress, referralPhone, notes, followUpDelay } = body;

      if (!patientId) {
        return NextResponse.json({ error: "patientId is required" }, { status: 400 });
      }

      log.info("Creating referral", { patientId });
      const result = await fetchMutation(
        api.referrals.create,
        {
          userEmail,
          patientId: patientId as Id<"patients">,
          referralName,
          referralAddress,
          referralPhone,
          notes,
          followUpDelay: followUpDelay ?? 0,
        },
        { token },
      );

      // If delay is 0 (immediate), send the follow-up SMS now
      if ((followUpDelay ?? 0) === 0) {
        try {
          await fetchAction(
            internal.proReminders.sendReferralFollowUp,
            { referralId: result.referralId },
            { token },
          );
          log.info("Immediate follow-up sent", { referralId: result.referralId });
        } catch (smsErr) {
          log.error("Failed to send immediate follow-up", smsErr);
        }
      }

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      log.error("Failed to create referral", error);
      return NextResponse.json({ error: safeErrorMessage(error, "Failed to create referral") }, { status: 500 });
    }
  });
}
