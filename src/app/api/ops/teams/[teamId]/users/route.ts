import { NextRequest, NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { internal } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const convex = createAdminConvexClient();
    const users = await convex.query(internal.ops.listTeamUsers, {
      teamId: teamId as Id<"teams">,
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Ops list team users error:", error);
    return NextResponse.json(
      { error: "Failed to list team users" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await request.json();

    if (!body.userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const convex = createAdminConvexClient();
    const result = await convex.mutation(internal.ops.assignUserToTeam, {
      userId: body.userId as Id<"users">,
      teamId: teamId as Id<"teams">,
      clinicRole: body.clinicRole,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to assign user";
    console.error("Ops assign user error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    await params;
    const body = await request.json();

    if (!body.userId || !body.clinicRole) {
      return NextResponse.json(
        { error: "userId and clinicRole are required" },
        { status: 400 }
      );
    }

    const convex = createAdminConvexClient();
    const result = await convex.mutation(internal.ops.updateClinicUserRole, {
      userId: body.userId as Id<"users">,
      clinicRole: body.clinicRole,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    console.error("Ops update role error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    await params;
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId query param is required" },
        { status: 400 }
      );
    }

    const convex = createAdminConvexClient();
    const result = await convex.mutation(internal.ops.unassignUserFromTeam, {
      userId: userId as Id<"users">,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unassign user";
    console.error("Ops unassign user error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
