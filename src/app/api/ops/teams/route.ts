import { NextRequest, NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { internal } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  try {
    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";

    const convex = createAdminConvexClient();
    const teams = await convex.query(internal.ops.listTeams, {
      includeArchived,
    });

    return NextResponse.json(teams);
  } catch (error) {
    console.error("Ops list teams error:", error);
    return NextResponse.json(
      { error: "Failed to list teams" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Team name is required" },
        { status: 400 }
      );
    }

    const convex = createAdminConvexClient();
    const result = await convex.mutation(internal.ops.createTeam, {
      name: body.name.trim(),
      contactPhone: body.contactPhone?.trim() || undefined,
      timezone: body.timezone || undefined,
      hospitalAddress: body.hospitalAddress?.trim() || undefined,
      languageMode: body.languageMode || undefined,
      rescheduleUrl: body.rescheduleUrl?.trim() || undefined,
      entrySlug: body.entrySlug?.trim() || undefined,
      features: body.features || undefined,
      smsConfig: body.smsConfig || undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create team";
    console.error("Ops create team error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
