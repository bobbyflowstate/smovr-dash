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

describe("GET /api/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("lists requests without status filter", async () => {
    mockFetchQuery.mockResolvedValue([{ _id: "r1", status: "pending" }]);

    const { GET } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockFetchQuery).toHaveBeenCalledWith(expect.anything(), {}, { token: "tok_test" });
  });

  it("passes status filter when provided", async () => {
    mockFetchQuery.mockResolvedValue([{ _id: "r1", status: "scheduled" }]);

    const { GET } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests?status=scheduled");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { status: "scheduled" },
      { token: "tok_test" },
    );
  });
});

describe("PATCH /api/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { PATCH } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests", {
      method: "PATCH",
      body: JSON.stringify({ requestId: "r1", status: "scheduled" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const { PATCH } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests", {
      method: "PATCH",
      body: JSON.stringify({ requestId: "r1" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(400);
  });

  it("resolves request and returns success", async () => {
    mockFetchMutation.mockResolvedValue({ success: true });

    const { PATCH } = await import("../src/app/api/requests/route");
    const req = new NextRequest("http://localhost:3000/api/requests", {
      method: "PATCH",
      body: JSON.stringify({ requestId: "r1", status: "dismissed" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      { requestId: "r1", status: "dismissed" },
      { token: "tok_test" },
    );
  });
});
