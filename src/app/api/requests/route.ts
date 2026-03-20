import { NextRequest, NextResponse } from "next/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getAuthenticatedUser, AuthError, safeErrorMessage } from "@/lib/api-utils";
import { runWithContext, createRequestContext, getLogger } from "@/lib/observability";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "GET",
    route: "requests.list",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token } = await getAuthenticatedUser();

      const status = request.nextUrl.searchParams.get("status");
      const isValidStatus =
        status === "pending" || status === "scheduled" || status === "dismissed";

      log.info("Fetching scheduling requests", { status: status ?? "all" });
      const requests = await fetchQuery(
        api.schedulingRequests.listForTeam,
        isValidStatus ? { status } : {},
        { token },
      );
      return NextResponse.json(requests);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      log.error("Failed to fetch scheduling requests", error);
      return NextResponse.json(
        { error: safeErrorMessage(error, "Failed to fetch requests") },
        { status: 500 },
      );
    }
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: "PATCH",
    route: "requests.resolve",
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    try {
      const { token } = await getAuthenticatedUser();
      const body = await request.json();
      const { requestId, status } = body as {
        requestId?: string;
        status?: "scheduled" | "dismissed";
      };

      if (!requestId || !status) {
        return NextResponse.json(
          { error: "requestId and status are required" },
          { status: 400 },
        );
      }

      if (status !== "scheduled" && status !== "dismissed") {
        return NextResponse.json(
          { error: "status must be either 'scheduled' or 'dismissed'" },
          { status: 400 },
        );
      }

      log.info("Resolving scheduling request", { requestId, status });
      await fetchMutation(
        api.schedulingRequests.resolve,
        { requestId: requestId as Id<"schedulingRequests">, status },
        { token },
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      log.error("Failed to resolve scheduling request", error);
      return NextResponse.json(
        { error: safeErrorMessage(error, "Failed to resolve request") },
        { status: 500 },
      );
    }
  });
}
