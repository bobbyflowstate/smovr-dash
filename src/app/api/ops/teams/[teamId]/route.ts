import { NextRequest, NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const convex = createAdminConvexClient();
    const team = await convex.query(internal.ops.getTeam, {
      teamId: teamId as Id<"teams">,
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json(team);
  } catch (error) {
    console.error("Ops get team error:", error);
    return NextResponse.json(
      { error: "Failed to get team" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await request.json();

    const convex = createAdminConvexClient();
    const result = await convex.mutation(internal.ops.updateTeam, {
      teamId: teamId as Id<"teams">,
      name: body.name,
      contactPhone: body.contactPhone,
      timezone: body.timezone,
      hospitalAddress: body.hospitalAddress,
      languageMode: body.languageMode,
      rescheduleUrl: body.rescheduleUrl,
      entrySlug: body.entrySlug,
      features: body.features,
      smsConfig: body.smsConfig,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update team";
    console.error("Ops update team error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const convex = createAdminConvexClient();
    await convex.mutation(internal.ops.archiveTeam, {
      teamId: teamId as Id<"teams">,
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to archive team";
    console.error("Ops archive team error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
