import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const fetchMutationMock = vi.fn();
const fetchQueryMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();

class MockAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

vi.mock("convex/nextjs", () => ({
  fetchMutation: (...args: unknown[]) => fetchMutationMock(...args),
  fetchQuery: (...args: unknown[]) => fetchQueryMock(...args),
}));

vi.mock("@/lib/api-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
  AuthError: MockAuthError,
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

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures team assignment before reading current user", async () => {
    getAuthenticatedUserMock.mockResolvedValue({ token: "token-123" });
    fetchMutationMock.mockResolvedValue(undefined);
    fetchQueryMock.mockResolvedValue({
      userId: "user_1",
      userEmail: "user@test.com",
      userName: "User Test",
      teamId: "team_1",
      teamName: "Clinic One",
    });

    const { GET } = await import("@/app/api/users/route");
    const req = new NextRequest("http://localhost/api/users");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      userName: "User Test",
      userEmail: "user@test.com",
      teamName: "Clinic One",
      teamId: "team_1",
      userId: "user_1",
    });

    expect(fetchMutationMock).toHaveBeenCalledTimes(1);
    expect(fetchQueryMock).toHaveBeenCalledTimes(1);
    expect(fetchMutationMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchQueryMock.mock.invocationCallOrder[0],
    );
  });
});
