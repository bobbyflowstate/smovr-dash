import { NextRequest, NextResponse } from "next/server";
import { api, internal } from "../../../../convex/_generated/api";
import { createAdminConvexClient } from "@/lib/convex-server";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";
import {
  safeErrorMessage,
  getClientIp,
  applyIpRateLimit,
  isHoneypotTriggered,
  normalizePhone,
  resolveSMSProvider,
} from "@/lib/api-utils";
import { formatBookingConfirmationMessage, type LanguageMode } from "../../../../convex/webhook_utils";
import type { Id } from "../../../../convex/_generated/dataModel";

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

      const { teamId, patientName, patientPhone, notes } = body as {
        teamId: string;
        patientName?: string;
        patientPhone?: string;
        notes?: string;
      };

      if (!teamId || !patientPhone) {
        return NextResponse.json(
          { error: "Team ID and phone number are required" },
          { status: 400 },
        );
      }

      log.info("Processing booking request", { teamId, source: "booking_page" });

      const convex = createAdminConvexClient();

      const result = await convex.mutation(api.schedulingRequests.createPublic, {
        teamId: teamId as Id<"teams">,
        patientPhone,
        patientName: patientName || undefined,
        notes: notes || undefined,
        source: "booking_page",
      });

      try {
        const team = await convex.query(api.teams.getById, {
          teamId: teamId as Id<"teams">,
        });
        const languageMode: LanguageMode = (team?.languageMode as LanguageMode) ?? "en_es";
        const message = formatBookingConfirmationMessage(patientName || null, languageMode);

        const phone = normalizePhone(patientPhone);
        const provider = await resolveSMSProvider(convex, teamId as Id<"teams">);
        const smsResult = await provider.sendMessage({ to: phone, body: message });

        await convex.mutation(internal.messages.createSystemMessageInternal, {
          teamId: teamId as Id<"teams">,
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
      return NextResponse.json(
        { error: safeErrorMessage(error, "Failed to submit booking request") },
        { status: 500 },
      );
    }
  });
}
