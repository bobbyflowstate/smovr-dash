import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockConvex = {
  query: vi.fn(),
  mutation: vi.fn(),
};

const mockResolveSMSProvider = vi.fn();

vi.mock("@/lib/convex-server", () => ({
  createAdminConvexClient: () => mockConvex,
}));

vi.mock("@/lib/api-utils", () => ({
  safeErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error && !err.message.includes("\n") && err.message.length < 200
      ? err.message
      : fallback,
  isRateLimitError: (err: unknown) =>
    err instanceof Error ? /too many requests/i.test(err.message) : false,
  getClientIp: () => "127.0.0.1",
  applyIpRateLimit: () => null,
  isHoneypotTriggered: () => false,
  normalizePhone: (phone: string) => phone.replace(/\D/g, ""),
  resolveSMSProvider: (...args: unknown[]) => mockResolveSMSProvider(...args),
}));

vi.mock("@/lib/observability", () => ({
  runWithContext: async (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  createRequestContext: () => ({}),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("Public booking/entry routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOW_LEGACY_PUBLIC_TEAM_ID;
    mockResolveSMSProvider.mockResolvedValue({
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    });
  });

  it("POST /api/book resolves team by slug and ignores client-supplied teamId", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_from_slug",
      languageMode: "en",
      entrySlug: "clinic-a",
    });
    mockConvex.mutation
      .mockResolvedValueOnce({ requestId: "r1", patientId: "p1" })
      .mockResolvedValueOnce({});

    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-a",
        teamId: "attacker_team_id",
        patientPhone: "(555) 111-2222",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockConvex.mutation).toHaveBeenCalled();
    const createPublicCall = mockConvex.mutation.mock.calls[0];
    expect(createPublicCall[1]).toEqual(
      expect.objectContaining({ teamId: "team_from_slug", source: "booking_page" }),
    );
  });

  it("POST /api/entry resolves team by slug and ignores client-supplied teamId", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_from_slug",
      languageMode: "en_es",
      entrySlug: "clinic-b",
    });
    mockConvex.mutation
      .mockResolvedValueOnce({ requestId: "r2", patientId: "p2" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { POST } = await import("../src/app/api/entry/route");
    const req = new NextRequest("http://localhost:3000/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-b",
        teamId: "attacker_team_id",
        patientPhone: "5553334444",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const createPublicCall = mockConvex.mutation.mock.calls[0];
    expect(createPublicCall[1]).toEqual(
      expect.objectContaining({ teamId: "team_from_slug", source: "website_button" }),
    );
  });

  it("POST /api/book returns 404 for unknown team slug", async () => {
    mockConvex.query.mockResolvedValue(null);

    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "unknown-clinic",
        patientPhone: "5559990000",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/book returns 404 for archived team", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_archived",
      languageMode: "en",
      entrySlug: "clinic-archived",
      isArchived: true,
    });

    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-archived",
        patientPhone: "5551112222",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/book returns 404 when booking page feature is disabled", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_disabled",
      languageMode: "en",
      entrySlug: "clinic-disabled",
      features: { booking_page_enabled: false },
    });

    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-disabled",
        patientPhone: "5551112222",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/book rejects legacy teamId payload when compatibility flag is off", async () => {
    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: "legacy-team-id",
        patientPhone: "5550001111",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Legacy teamId payload is disabled");
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/book maps Convex rate-limit errors to HTTP 429", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_from_slug",
      languageMode: "en",
      entrySlug: "clinic-a",
    });
    mockConvex.mutation.mockRejectedValueOnce(new Error("Too many requests. Please try again later."));

    const { POST } = await import("../src/app/api/book/route");
    const req = new NextRequest("http://localhost:3000/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-a",
        patientPhone: "(555) 111-2222",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Too many requests");
  });

  it("POST /api/entry allows legacy teamId payload when compatibility flag is on", async () => {
    process.env.ALLOW_LEGACY_PUBLIC_TEAM_ID = "true";
    mockConvex.query.mockResolvedValue({
      _id: "legacy_team",
      languageMode: "en",
      entrySlug: "legacy-clinic",
    });
    mockConvex.mutation
      .mockResolvedValueOnce({ requestId: "r3", patientId: "p3" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { POST } = await import("../src/app/api/entry/route");
    const req = new NextRequest("http://localhost:3000/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: "legacy_team",
        patientPhone: "5552223333",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const createPublicCall = mockConvex.mutation.mock.calls[0];
    expect(createPublicCall[1]).toEqual(
      expect.objectContaining({ teamId: "legacy_team", source: "website_button" }),
    );
  });

  it("POST /api/entry returns 404 for archived team", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_archived",
      languageMode: "en_es",
      entrySlug: "clinic-archived",
      isArchived: true,
    });

    const { POST } = await import("../src/app/api/entry/route");
    const req = new NextRequest("http://localhost:3000/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-archived",
        patientPhone: "5553334444",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/entry returns 404 when website entry feature is disabled", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_disabled",
      languageMode: "en_es",
      entrySlug: "clinic-disabled",
      features: { website_entry_enabled: false },
    });

    const { POST } = await import("../src/app/api/entry/route");
    const req = new NextRequest("http://localhost:3000/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-disabled",
        patientPhone: "5553334444",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("POST /api/entry maps Convex rate-limit errors to HTTP 429", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "team_from_slug",
      languageMode: "en_es",
      entrySlug: "clinic-b",
    });
    mockConvex.mutation.mockRejectedValueOnce(new Error("Too many requests. Please try again later."));

    const { POST } = await import("../src/app/api/entry/route");
    const req = new NextRequest("http://localhost:3000/api/entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamSlug: "clinic-b",
        patientPhone: "5553334444",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Too many requests");
  });
});

describe("GET /api/teams/by-slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose internal team id in public response", async () => {
    mockConvex.query.mockResolvedValue({
      _id: "secret-team-id",
      name: "Clinic X",
      entrySlug: "clinic-x",
      languageMode: "en",
      contactPhone: "5551112222",
    });

    const { GET } = await import("../src/app/api/teams/by-slug/route");
    const req = new NextRequest("http://localhost:3000/api/teams/by-slug?slug=clinic-x");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body._id).toBeUndefined();
    expect(body.entrySlug).toBe("clinic-x");
    expect(body.name).toBe("Clinic X");
  });
});
