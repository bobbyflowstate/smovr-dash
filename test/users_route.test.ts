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
}));

const mockFetchMutation = vi.fn();
const mockFetchQuery = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchMutation: (...args: unknown[]) => mockFetchMutation(...args),
  fetchQuery: (...args: unknown[]) => mockFetchQuery(...args),
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
};

const CURRENT_USER = {
  userId: "u1",
  userEmail: "doc@clinic.com",
  teamId: "t1",
  teamName: "Clinic A",
  userName: "Dr. Test",
};

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
    mockFetchMutation.mockResolvedValue(undefined);
    mockFetchQuery.mockResolvedValue(CURRENT_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/users/route");
    const req = new NextRequest("http://localhost:3000/api/users");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns user info from currentUser query", async () => {
    const { GET } = await import("../src/app/api/users/route");
    const req = new NextRequest("http://localhost:3000/api/users");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      userName: "Dr. Test",
      userEmail: "doc@clinic.com",
      teamName: "Clinic A",
      teamId: "t1",
      userId: "u1",
    });
  });

  it("calls ensureTeam on each request", async () => {
    const { GET } = await import("../src/app/api/users/route");
    const req = new NextRequest("http://localhost:3000/api/users");
    await GET(req);

    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      {},
      { token: "tok_test" }
    );
  });

  it("never passes an empty string for userEmail", async () => {
    const { GET } = await import("../src/app/api/users/route");
    const req = new NextRequest("http://localhost:3000/api/users");
    const res = await GET(req);

    const body = await res.json();
    expect(body.userEmail).not.toBe("");
    expect(body.userEmail).toBe("doc@clinic.com");
  });

  it("falls back teamName to 'Unknown Team' when empty", async () => {
    mockFetchQuery.mockResolvedValue({
      ...CURRENT_USER,
      teamName: "",
    });

    const { GET } = await import("../src/app/api/users/route");
    const req = new NextRequest("http://localhost:3000/api/users");
    const res = await GET(req);

    const body = await res.json();
    expect(body.teamName).toBe("Unknown Team");
  });
});
