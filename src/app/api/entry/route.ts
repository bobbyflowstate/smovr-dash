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

      const { teamSlug, patientName, patientPhone } = body as {
        teamSlug?: string;
        teamId?: string;
        patientName?: string;
        patientPhone?: string;
      };
      const legacyTeamId = (body as { teamId?: string }).teamId;

      if ((!teamSlug && !legacyTeamId) || !patientPhone) {
        return NextResponse.json(
          { error: "Team slug (or legacy teamId) and phone number are required" },
          { status: 400 },
        );
      }

      log.info("Processing website entry", { teamSlug, source: "website_button" });

      const convex = createAdminConvexClient();
      const allowLegacyTeamId = process.env.ALLOW_LEGACY_PUBLIC_TEAM_ID === "true";
      const team = teamSlug
        ? await convex.query(api.teams.getByEntrySlug, { slug: teamSlug })
        : allowLegacyTeamId && legacyTeamId
          ? await convex.query(api.teams.getById, { teamId: legacyTeamId as Id<"teams"> })
          : null;

      if (!teamSlug && legacyTeamId) {
        if (allowLegacyTeamId) {
          log.warn("Using legacy teamId payload for public entry route", {
            source: "website_button",
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
      const teamId = team._id;

      const result = await convex.mutation(api.schedulingRequests.createPublic, {
        teamId,
        patientPhone,
        patientName: patientName || undefined,
        source: "website_button",
      });

      try {
        const languageMode: LanguageMode = (team.languageMode as LanguageMode) ?? "en_es";
        const message = formatWebsiteEntryMessage(patientName || null, languageMode);

        const phone = normalizePhone(patientPhone);
        const provider = await resolveSMSProvider(convex, teamId);
        const smsResult = await provider.sendMessage({ to: phone, body: message });

        await convex.mutation(internal.messages.createSystemMessageInternal, {
          teamId,
          patientId: result.patientId,
          phone,
          body: message,
          messageType: "website_entry",
          status: smsResult.success ? "sent" : "failed",
          errorMessage: smsResult.error ?? undefined,
        });

        await convex.mutation(api.audit_logs.createAuditLog, {
          patientId: result.patientId,
          teamId,
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
      const message = safeErrorMessage(error, "Failed to submit request");
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
