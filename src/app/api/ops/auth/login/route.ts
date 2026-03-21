import { NextRequest, NextResponse } from "next/server";
import { createAdminConvexClient } from "@/lib/convex-server";
import { internal } from "../../../../../../convex/_generated/api";
import { createOpsSession } from "@/lib/ops-auth";
import { applyIpRateLimit, getClientIp } from "@/lib/api-utils";

const COOKIE_NAME = "ops_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResponse = applyIpRateLimit(ip);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const convex = createAdminConvexClient();
    const admin = await convex.query(internal.opsAuth.verifyCredentials, {
      email,
      password,
    });

    if (!admin) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = await createOpsSession(admin.email);

    const response = NextResponse.json({ success: true, email: admin.email });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Ops login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
