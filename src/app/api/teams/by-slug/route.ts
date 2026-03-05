import { NextRequest, NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { api } from "../../../../../convex/_generated/api";

/**
 * GET /api/teams/by-slug?slug=xxx — Public endpoint to look up a team by
 * its entrySlug. Returns only the fields the booking page needs.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    const convex = createAdminConvexClient();
    const team = await convex.query(api.teams.getByEntrySlug, { slug });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({
      _id: team._id,
      name: team.name,
      languageMode: team.languageMode ?? "en_es",
      contactPhone: team.contactPhone,
    });
  } catch (error) {
    console.error("Failed to look up team by slug:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
