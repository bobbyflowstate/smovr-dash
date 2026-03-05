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
import { formatWebsiteEntryMessage, type LanguageMode } from "../../../../convex/webhook_utils";
import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * POST /api/entry — Public endpoint for the /entry/[slug] website button form.
 *
 * Creates (or updates) a patient, inserts a schedulingRequest with
 * source="website_button", sends a first-contact SMS, and logs the event.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResponse = applyIpRateLimit(ip);
  if (rateLimitResponse) return rateLimitResponse;

  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "POST",
    route: "entry.submit",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const body = await request.json();

      if (isHoneypotTriggered(body)) {
        log.warn("Honeypot triggered", { ip });
        return NextResponse.json({ success: true });
      }

      const { teamId, patientName, patientPhone } = body as {
        teamId: string;
        patientName?: string;
        patientPhone?: string;
      };

      if (!teamId || !patientPhone) {
        return NextResponse.json(
          { error: "Team ID and phone number are required" },
          { status: 400 },
        );
      }

      log.info("Processing website entry", { teamId, source: "website_button" });

      const convex = createAdminConvexClient();

      const result = await convex.mutation(api.schedulingRequests.createPublic, {
        teamId: teamId as Id<"teams">,
        patientPhone,
        patientName: patientName || undefined,
        source: "website_button",
      });

      try {
        const team = await convex.query(api.teams.getById, {
          teamId: teamId as Id<"teams">,
        });
        const languageMode: LanguageMode = (team?.languageMode as LanguageMode) ?? "en_es";
        const message = formatWebsiteEntryMessage(patientName || null, languageMode);

        const phone = normalizePhone(patientPhone);
        const provider = await resolveSMSProvider(convex, teamId as Id<"teams">);
        const smsResult = await provider.sendMessage({ to: phone, body: message });

        await convex.mutation(internal.messages.createSystemMessageInternal, {
          teamId: teamId as Id<"teams">,
          patientId: result.patientId,
          phone,
          body: message,
          messageType: "website_entry",
          status: smsResult.success ? "sent" : "failed",
          errorMessage: smsResult.error ?? undefined,
        });

        await convex.mutation(internal.audit_logs.createAuditLog, {
          patientId: result.patientId,
          teamId: teamId as Id<"teams">,
          action: "website_entry",
          message: `Website entry from ${patientName || "visitor"} (${patientPhone})`,
        });

        log.info("Website entry SMS sent", { patientId: result.patientId, smsOk: smsResult.success });
      } catch (smsError) {
        log.error("Failed to send website entry SMS", smsError);
      }

      return NextResponse.json({ success: true, requestId: result.requestId });
    } catch (error) {
      log.error("Website entry request failed", error);
      return NextResponse.json(
        { error: safeErrorMessage(error, "Failed to submit request") },
        { status: 500 },
      );
    }
  });
}
