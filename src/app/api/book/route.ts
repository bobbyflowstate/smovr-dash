import { NextRequest, NextResponse } from "next/server";
import { api, internal } from "../../../../convex/_generated/api";
import { createAdminConvexClient } from "@/lib/convex-server";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";
import {
  safeErrorMessage,
  isRateLimitError,
  getClientIp,
  applyIpRateLimit,
  isHoneypotTriggered,
  normalizePhone,
  resolveSMSProvider,
} from "@/lib/api-utils";
import { formatBookingConfirmationMessage, type LanguageMode } from "../../../../convex/webhook_utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { isFeatureEnabled } from "../../../../convex/lib/featureFlags";

/**
 * POST /api/book — Public endpoint for the /book/[slug] form.
 *
 * Creates (or updates) a patient, inserts a schedulingRequest, and sends a
 * confirmation SMS. No auth required — this is a patient-facing form.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResponse = applyIpRateLimit(ip);
  if (rateLimitResponse) return rateLimitResponse;

  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "POST",
    route: "book.submit",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const body = await request.json();

      if (isHoneypotTriggered(body)) {
        log.warn("Honeypot triggered", { ip });
        return NextResponse.json({ success: true, requestId: "ok" });
      }

      const { teamSlug, patientName, patientPhone, notes } = body as {
        teamSlug?: string;
        teamId?: string;
        patientName?: string;
        patientPhone?: string;
        notes?: string;
      };
      const legacyTeamId = (body as { teamId?: string }).teamId;

      if ((!teamSlug && !legacyTeamId) || !patientPhone) {
        return NextResponse.json(
          { error: "Team slug (or legacy teamId) and phone number are required" },
          { status: 400 },
        );
      }

      log.info("Processing booking request", { teamSlug, source: "booking_page" });

      const convex = createAdminConvexClient();
      const allowLegacyTeamId = process.env.ALLOW_LEGACY_PUBLIC_TEAM_ID === "true";
      const team = teamSlug
        ? await convex.query(api.teams.getByEntrySlug, { slug: teamSlug })
        : allowLegacyTeamId && legacyTeamId
          ? await convex.query(api.teams.getById, { teamId: legacyTeamId as Id<"teams"> })
          : null;

      if (!teamSlug && legacyTeamId) {
        if (allowLegacyTeamId) {
          log.warn("Using legacy teamId payload for public booking route", {
            source: "booking_page",
          });
        } else {
          return NextResponse.json(
            { error: "Legacy teamId payload is disabled. Send teamSlug instead." },
            { status: 400 },
          );
        }
      }

      if (!team) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      if (team.isArchived) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      if (!isFeatureEnabled(team.features, "booking_page_enabled")) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      const teamId = team._id;

      const result = await convex.mutation(api.schedulingRequests.createPublic, {
        teamId,
        patientPhone,
        patientName: patientName || undefined,
        notes: notes || undefined,
        source: "booking_page",
      });

      try {
        const languageMode: LanguageMode = (team.languageMode as LanguageMode) ?? "en_es";
        const message = formatBookingConfirmationMessage(patientName || null, languageMode);

        const phone = normalizePhone(patientPhone);
        const provider = await resolveSMSProvider(convex, teamId);
        const smsResult = await provider.sendMessage({ to: phone, body: message });

        await convex.mutation(internal.messages.createSystemMessageInternal, {
          teamId,
          patientId: result.patientId,
          phone,
          body: message,
          messageType: "booking_confirmation",
          status: smsResult.success ? "sent" : "failed",
          errorMessage: smsResult.error ?? undefined,
        });

        log.info("Booking SMS sent", { patientId: result.patientId, smsOk: smsResult.success });
      } catch (smsError) {
        log.error("Failed to send booking confirmation SMS", smsError);
      }

      return NextResponse.json({ success: true, requestId: result.requestId });
    } catch (error) {
      log.error("Booking request failed", error);
      const message = safeErrorMessage(error, "Failed to submit booking request");
      if (isRateLimitError(error)) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: message },
        { status: 500 },
      );
    }
  });
}
