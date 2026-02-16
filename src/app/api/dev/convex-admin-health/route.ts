import { NextResponse } from "next/server";
import { internal } from "../../../../../convex/_generated/api";
import { createAdminConvexClient } from "@/lib/convex-server";

/**
 * Local-only smoke check for Convex admin auth.
 *
 * Verifies that Next.js route handlers can call internal Convex functions
 * with the configured CONVEX_URL + CONVEX_DEPLOY_KEY.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const convex = createAdminConvexClient();
    await convex.query(internal.reminders.getAllFutureAppointments, {
      nowISO: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: "Convex admin auth is configured correctly.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: "Convex admin auth check failed",
        detail: message,
      },
      { status: 500 }
    );
  }
}
