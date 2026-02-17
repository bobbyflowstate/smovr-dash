import { NextRequest, NextResponse } from "next/server";

/**
 * Local-only mock endpoint for GoHighLevel SMS webhooks.
 *
 * Point `GHL_SMS_WEBHOOK_URL` at:
 *   http://localhost:3000/api/dev/mock-sms
 *
 * This will log `{ phone, message }` payloads to your Next.js server console and return 200 OK.
 */
export async function POST(request: NextRequest) {
  // Avoid accidentally exposing this in production.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as { phone?: unknown; message?: unknown };
  const phone = typeof payload.phone === "string" ? payload.phone : null;
  const message = typeof payload.message === "string" ? payload.message : null;

  if (!phone || !message) {
    return NextResponse.json(
      { error: "Expected JSON payload: { phone: string, message: string }" },
      { status: 400 }
    );
  }

  console.log("[mock-sms] Received SMS webhook", {
    phone,
    messagePreview: message.slice(0, 160),
    messageLength: message.length,
  });

  return NextResponse.json({ ok: true });
}


