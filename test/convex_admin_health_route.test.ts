import { describe, expect, it, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const originalNodeEnv = process.env.NODE_ENV;

vi.mock("@/lib/convex-server", () => ({
  createAdminConvexClient: () => ({
    query: mockQuery,
  }),
}));

describe("GET /api/dev/convex-admin-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("returns ok when internal query succeeds", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    mockQuery.mockResolvedValueOnce([]);

    const { GET } = await import("../src/app/api/dev/convex-admin-health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when admin auth check fails", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    mockQuery.mockRejectedValueOnce(new Error("missing key"));

    const { GET } = await import("../src/app/api/dev/convex-admin-health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Convex admin auth check failed");
  });
});
