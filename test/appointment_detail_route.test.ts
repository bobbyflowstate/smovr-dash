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

vi.mock("@/lib/convex-server", () => ({
  createAdminConvexClient: () => ({
    query: vi.fn(),
    mutation: vi.fn(),
  }),
}));

vi.mock("@/lib/webhook-utils", () => ({
  sendCancelWebhook: vi.fn(),
}));

vi.mock("@/lib/appointments-integration", () => ({
  recordCancellationSmsAttempt: vi.fn(),
}));

const AUTH_USER = {
  token: "tok_test",
  userId: "u1",
  userEmail: "doc@clinic.com",
  teamId: "t1",
  teamName: "Clinic A",
  userName: "Dr. Test",
};

describe("GET /api/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchQuery.mockReset();
    mockFetchMutation.mockReset();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1");
    const res = await GET(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no team", async () => {
    mockFetchQuery.mockResolvedValueOnce({
      userId: "u1",
      userEmail: "doc@clinic.com",
      teamId: undefined,
      teamName: "Unknown Team",
    });

    const { GET } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1");
    const res = await GET(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/user or team not found/i);
  });

  it("returns 404 when appointment belongs to a different team", async () => {
    mockFetchQuery
      .mockResolvedValueOnce({
        userId: "u1",
        userEmail: "doc@clinic.com",
        teamId: "t1",
        teamName: "Clinic A",
      })
      .mockResolvedValueOnce({
        _id: "appt_1",
        teamId: "t_OTHER",
        patientId: "p1",
        dateTime: "2026-03-15T15:00:00Z",
      });

    const { GET } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1");
    const res = await GET(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(404);
  });

  it("returns appointment and patient data on success", async () => {
    mockFetchQuery
      .mockResolvedValueOnce({
        userId: "u1",
        userEmail: "doc@clinic.com",
        teamId: "t1",
        teamName: "Clinic A",
      })
      .mockResolvedValueOnce({
        _id: "appt_1",
        teamId: "t1",
        patientId: "p1",
        dateTime: "2026-03-15T15:00:00Z",
        notes: "Follow-up",
        status: "scheduled",
      })
      .mockResolvedValueOnce({
        _id: "p1",
        name: "Alice",
        phone: "+1111",
      })
      .mockResolvedValueOnce({
        _id: "t1",
        timezone: "America/Phoenix",
      });

    const { GET } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1");
    const res = await GET(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appointment._id).toBe("appt_1");
    expect(body.appointment.status).toBe("scheduled");
    expect(body.patient.name).toBe("Alice");
    expect(body.patient.phone).toBe("+1111");
    expect(body.teamTimezone).toBe("America/Phoenix");
  });
});

describe("DELETE /api/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchQuery.mockReset();
    mockFetchMutation.mockReset();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { DELETE } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(401);
  });

  it("returns 404 when appointment doesn't exist", async () => {
    mockFetchQuery.mockResolvedValue(null);

    const { DELETE } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_missing", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "appt_missing" } });

    expect(res.status).toBe(404);
  });

  it("cancels appointment using authenticated userEmail", async () => {
    mockFetchQuery
      .mockResolvedValueOnce({
        _id: "appt_1",
        teamId: "t1",
        patientId: "p1",
        dateTime: "2026-03-15T15:00:00Z",
      })
      .mockResolvedValueOnce({
        _id: "p1",
        name: "Alice",
        phone: "+1111",
      });
    mockFetchMutation.mockResolvedValue(undefined);

    const { DELETE } = await import("../src/app/api/appointments/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/appointments/appt_1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "appt_1" } });

    expect(res.status).toBe(200);
    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      { id: "appt_1", userEmail: "doc@clinic.com" },
      { token: "tok_test" }
    );
  });
});
