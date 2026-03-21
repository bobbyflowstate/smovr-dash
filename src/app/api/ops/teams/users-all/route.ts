import { NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { internal } from "../../../../../../convex/_generated/api";

export async function GET() {
  try {
    const convex = createAdminConvexClient();
    const users = await convex.query(internal.ops.listAllUsers, {});
    return NextResponse.json(users);
  } catch (error) {
    console.error("Ops list all users error:", error);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}
