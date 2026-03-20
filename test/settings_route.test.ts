import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

class MockAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}

const mockGetAuthenticatedUser = vi.fn();

vi.mock("@/lib/api-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  AuthError: MockAuthError,
  safeErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error && !err.message.includes("\n") && err.message.length < 200
      ? err.message
      : fallback,
}));

const mockFetchQuery = vi.fn();
const mockFetchMutation = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => mockFetchQuery(...args),
  fetchMutation: (...args: unknown[]) => mockFetchMutation(...args),
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
  extendContext: vi.fn(),
}));

const AUTH_USER = {
  token: "tok_test",
  userId: "u1",
  userEmail: "doc@clinic.com",
  teamId: "t1",
  teamName: "Clinic A",
  userName: "Dr. Test",
};

const SAMPLE_SETTINGS = {
  _id: "t1",
  name: "Clinic A",
  contactPhone: "+15551234567",
  timezone: "America/Phoenix",
  hospitalAddress: "123 Main St",
  languageMode: "en_es",
  rescheduleUrl: undefined,
  entrySlug: "clinic-a",
};

describe("GET /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns team settings", async () => {
    mockFetchQuery.mockResolvedValue(SAMPLE_SETTINGS);

    const { GET } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Clinic A");
    expect(body.languageMode).toBe("en_es");
    expect(body.entrySlug).toBe("clinic-a");
  });

  it("passes auth token to fetchQuery", async () => {
    mockFetchQuery.mockResolvedValue(SAMPLE_SETTINGS);

    const { GET } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings");
    await GET(req);

    expect(mockFetchQuery).toHaveBeenCalledWith(expect.anything(), {}, { token: "tok_test" });
  });
});

describe("PATCH /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { PATCH } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(401);
  });

  it("updates settings and returns success", async () => {
    mockFetchMutation.mockResolvedValue({ success: true });

    const { PATCH } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ name: "New Name", languageMode: "en" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns error message from mutation failure", async () => {
    mockFetchMutation.mockRejectedValue(
      new Error("This entry slug is already in use by another team"),
    );

    const { PATCH } = await import("../src/app/api/settings/route");
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ entrySlug: "taken-slug" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("This entry slug is already in use by another team");
  });
});
