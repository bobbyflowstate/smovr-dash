import { describe, expect, it, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("@/lib/convex-server", () => ({
  createAdminConvexClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
}));

vi.mock("@/lib/api-utils", async () => {
  const { NextResponse } = await import("next/server");
  const ipHits = new Map<string, number[]>();
  const WINDOW_MS = 60_000;
  const MAX_REQUESTS = 10;

  return {
    getClientIp: (request: Request) =>
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    applyIpRateLimit: (ip: string) => {
      const now = Date.now();
      const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
      hits.push(now);
      ipHits.set(ip, hits);
      if (hits.length > MAX_REQUESTS) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }
      return null;
    },
    __resetIpRateLimit: () => ipHits.clear(),
  };
});

const SECRET = "test-ops-jwt-secret-for-unit-tests";

function setEnv() {
  vi.stubEnv("OPS_JWT_SECRET", SECRET);
  vi.stubEnv("CONVEX_URL", "http://localhost:3210");
  vi.stubEnv("CONVEX_ADMIN_KEY", "fake-admin-key");
}

async function makeValidToken(email: string, expiresIn = "8h") {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(email)
    .sign(new TextEncoder().encode(SECRET));
}

async function makeExpiredToken(email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .setSubject(email)
    .sign(new TextEncoder().encode(SECRET));
}

describe("ops-auth JWT utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv();
  });

  it("createOpsSession returns a valid JWT", async () => {
    const { createOpsSession, verifyOpsSession } = await import("@/lib/ops-auth");
    const token = await createOpsSession("admin@test.com");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const result = await verifyOpsSession(token);
    expect(result).toEqual({ email: "admin@test.com" });
  });

  it("verifyOpsSession rejects expired tokens", async () => {
    const { verifyOpsSession } = await import("@/lib/ops-auth");
    const expired = await makeExpiredToken("admin@test.com");
    const result = await verifyOpsSession(expired);
    expect(result).toBeNull();
  });

  it("verifyOpsSession rejects tokens signed with wrong key", async () => {
    const { verifyOpsSession } = await import("@/lib/ops-auth");

    const wrongKeyToken = await new SignJWT({ email: "admin@test.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode("wrong-secret"));

    const result = await verifyOpsSession(wrongKeyToken);
    expect(result).toBeNull();
  });

  it("verifyOpsSession rejects garbage tokens", async () => {
    const { verifyOpsSession } = await import("@/lib/ops-auth");
    const result = await verifyOpsSession("not-a-jwt");
    expect(result).toBeNull();
  });

  it("verifyOpsSession rejects tokens without email claim", async () => {
    const { verifyOpsSession } = await import("@/lib/ops-auth");
    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode(SECRET));

    const result = await verifyOpsSession(token);
    expect(result).toBeNull();
  });
});

describe("ops feature flags", () => {
  it("isFeatureEnabled returns default when no features set", async () => {
    const { isFeatureEnabled } = await import("../convex/lib/featureFlags");

    expect(isFeatureEnabled(undefined, "referrals_enabled")).toBe(true);
    expect(isFeatureEnabled(undefined, "booking_page_enabled")).toBe(true);
  });

  it("isFeatureEnabled respects explicit overrides", async () => {
    const { isFeatureEnabled } = await import("../convex/lib/featureFlags");

    const features = { referrals_enabled: false, booking_page_enabled: true };
    expect(isFeatureEnabled(features, "referrals_enabled")).toBe(false);
    expect(isFeatureEnabled(features, "booking_page_enabled")).toBe(true);
    expect(isFeatureEnabled(features, "two_way_sms_enabled")).toBe(true);
  });
});

describe("ops login API route", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv();
  });

  it("rejects requests without email/password", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/ops/auth/login/route");

    const req = new NextRequest("http://localhost/api/ops/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated login attempts from the same IP", async () => {
    const apiUtils = await import("@/lib/api-utils");
    const resetIpRateLimit = (apiUtils as { __resetIpRateLimit?: () => void })
      .__resetIpRateLimit;
    resetIpRateLimit?.();

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/ops/auth/login/route");
    const ip = "203.0.113.77";

    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost/api/ops/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    }

    const blockedReq = new NextRequest("http://localhost/api/ops/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({}),
    });
    const blockedRes = await POST(blockedReq);
    expect(blockedRes.status).toBe(429);
  });

  it("rejects invalid credentials", async () => {
    const { createAdminConvexClient } = await import("@/lib/convex-server");
    (createAdminConvexClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockResolvedValue(null),
      mutation: vi.fn(),
    });

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/ops/auth/login/route");

    const req = new NextRequest("http://localhost/api/ops/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "bad@test.com", password: "wrong" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("sets ops_session cookie on valid login", async () => {
    const { createAdminConvexClient } = await import("@/lib/convex-server");
    (createAdminConvexClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockResolvedValue({ email: "admin@test.com", _id: "admin_1" }),
      mutation: vi.fn(),
    });

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/ops/auth/login/route");

    const req = new NextRequest("http://localhost/api/ops/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@test.com", password: "valid" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const cookie = res.cookies.get("ops_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
  });
});

describe("ops logout API route", () => {
  it("clears the ops_session cookie", async () => {
    const { POST } = await import("@/app/api/ops/auth/logout/route");
    const res = await POST();
    expect(res.status).toBe(200);

    const cookie = res.cookies.get("ops_session");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});

describe("ops teams API route auth", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv();
  });

  it("teams list returns data when authorized (via middleware pass-through)", async () => {
    const { createAdminConvexClient } = await import("@/lib/convex-server");
    (createAdminConvexClient as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      mutation: vi.fn(),
    });

    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/ops/teams/route");

    const req = new NextRequest("http://localhost/api/ops/teams");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("birthday message templatization", () => {
  it("includes team name in English birthday message", async () => {
    const { formatBirthdayMessage } = await import("../convex/webhook_utils");
    const msg = formatBirthdayMessage("Alice", "en", "Acme Dental");
    expect(msg).toContain("Acme Dental");
    expect(msg).not.toContain("our office");
  });

  it("includes team name in bilingual birthday message", async () => {
    const { formatBirthdayMessage } = await import("../convex/webhook_utils");
    const msg = formatBirthdayMessage("Maria", "en_es", "Acme Dental");
    expect(msg).toContain("Acme Dental");
    expect(msg).not.toContain("nuestra oficina");
  });

  it("falls back to 'our office' when no team name provided (English)", async () => {
    const { formatBirthdayMessage } = await import("../convex/webhook_utils");
    const msg = formatBirthdayMessage("Alice", "en");
    expect(msg).toContain("our office");
  });

  it("falls back to 'nuestra oficina' when no team name provided (bilingual)", async () => {
    const { formatBirthdayMessage } = await import("../convex/webhook_utils");
    const msg = formatBirthdayMessage("Maria", "en_es");
    expect(msg).toContain("nuestra oficina");
  });
});
