import { NextRequest, NextResponse } from "next/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";
import { safeErrorMessage } from "@/lib/api-utils";

/**
 * GET /api/referral-status?token=xxx — Public lookup of referral status (no auth)
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "GET",
    route: "referral-status.get",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const token = request.nextUrl.searchParams.get("token");
      if (!token) {
        return NextResponse.json({ error: "token is required" }, { status: 400 });
      }

      const referral = await fetchQuery(api.referrals.getByToken, { token });
      if (!referral) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }

      return NextResponse.json(referral);
    } catch (error) {
      log.error("Failed to fetch referral status", error);
      return NextResponse.json({ error: safeErrorMessage(error, "Failed to fetch status") }, { status: 500 });
    }
  });
}

/**
 * PATCH /api/referral-status — Public status update from landing page (no auth)
 */
export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "PATCH",
    route: "referral-status.update",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const body = await request.json();
      const { token, status } = body;

      if (!token || !status) {
        return NextResponse.json({ error: "token and status are required" }, { status: 400 });
      }

      if (status !== "confirmed" && status !== "needs_help") {
        return NextResponse.json({ error: "status must be 'confirmed' or 'needs_help'" }, { status: 400 });
      }

      log.info("Updating referral status", { status });
      await fetchMutation(api.referrals.updateStatusByToken, { token, status });

      return NextResponse.json({ success: true });
    } catch (error) {
      log.error("Failed to update referral status", error);
      return NextResponse.json({ error: safeErrorMessage(error, "Failed to update status") }, { status: 500 });
    }
  });
}
