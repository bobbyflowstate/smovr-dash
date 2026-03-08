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
    err instanceof Error ? err.message : fallback,
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

vi.mock("@/lib/timezone-utils", () => ({
  convertComponentsToTimezoneUTC: vi.fn(
    () => "2026-03-15T15:00:00.000Z"
  ),
  APPOINTMENT_TIMEZONE: "America/Los_Angeles",
  extractComponentsInTimezone: vi.fn(),
}));

vi.mock("@/lib/webhook-utils", () => ({
  sendScheduleWebhook: vi.fn(),
}));

vi.mock("@/lib/appointments-integration", () => ({
  recordBookingConfirmationAndMaybeSuppress: vi.fn(),
}));

const AUTH_USER = {
  token: "tok_test",
  userId: "u1",
  userEmail: "doc@clinic.com",
  teamId: "t1",
  teamName: "Clinic A",
  userName: "Dr. Test",
};

describe("GET /api/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it("fetches appointments with the authenticated user's email", async () => {
    const appointments = [
      { _id: "a1", dateTime: "2026-03-15T15:00:00Z", status: "scheduled" },
    ];
    mockFetchQuery.mockResolvedValue(appointments);

    const { GET } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(appointments);

    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { userEmail: "doc@clinic.com", includeCancelled: false },
      { token: "tok_test" }
    );
  });

  it("passes includeCancelled=true when query param is set", async () => {
    mockFetchQuery.mockResolvedValue([]);

    const { GET } = await import("../src/app/api/appointments/route");
    const req = new NextRequest(
      "http://localhost:3000/api/appointments?includeCancelled=1"
    );
    await GET(req);

    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { userEmail: "doc@clinic.com", includeCancelled: true },
      { token: "tok_test" }
    );
  });

  it("returns 500 on unexpected errors", async () => {
    mockFetchQuery.mockRejectedValue(new Error("DB down"));

    const { GET } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});

describe("POST /api/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);

    // Default: ensureTeam succeeds, currentUser returns user, no team query needed
    mockFetchMutation.mockResolvedValue({
      appointmentId: "appt_1",
      patientId: "p1",
      teamId: "t1",
      newAppointment: true,
    });

    mockFetchQuery.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      // currentUser call (no args)
      if (Object.keys(args).length === 0) {
        return { userId: "u1", userEmail: "doc@clinic.com", teamId: "t1", teamName: "Clinic A" };
      }
      // getById for team
      if ("teamId" in args) {
        return { timezone: "America/Phoenix", hospitalAddress: "123 Main St" };
      }
      // getExistingForPatient
      if ("phone" in args) {
        return null;
      }
      return null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { POST } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments", {
      method: "POST",
      body: JSON.stringify({ phone: "+1111", name: "Alice", appointmentDateTime: "2026-03-15T10:00:00Z" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("calls ensureTeam before creating the appointment", async () => {
    const { POST } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        phone: "+1111",
        name: "Alice",
        appointmentDateTime: "2026-03-15T10:00:00Z",
        skipExistingCheck: true,
      }),
      headers: { "content-type": "application/json" },
    });
    await POST(req);

    // First mutation call should be ensureTeam (no args), second should be scheduleAppointment
    expect(mockFetchMutation).toHaveBeenCalledTimes(2);
    expect(mockFetchMutation.mock.calls[0][1]).toEqual({});
  });

  it("passes authenticated userEmail to scheduleAppointment", async () => {
    const { POST } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        phone: "+1111",
        name: "Alice",
        appointmentDateTime: "2026-03-15T10:00:00Z",
        skipExistingCheck: true,
      }),
      headers: { "content-type": "application/json" },
    });
    await POST(req);

    const scheduleCall = mockFetchMutation.mock.calls[1];
    expect(scheduleCall[1]).toMatchObject({
      userEmail: "doc@clinic.com",
      phone: "+1111",
      name: "Alice",
    });
    expect(scheduleCall[2]).toEqual({ token: "tok_test" });
  });

  it("returns existing appointment info when duplicate is detected", async () => {
    mockFetchQuery.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (Object.keys(args).length === 0) {
        return { userId: "u1", userEmail: "doc@clinic.com", teamId: "t1", teamName: "Clinic A" };
      }
      if ("teamId" in args) {
        return { timezone: "America/Phoenix", hospitalAddress: "123 Main St" };
      }
      // getExistingForPatient: return an existing appointment
      if ("phone" in args && "userEmail" in args) {
        return {
          _id: "appt_existing",
          dateTime: "2026-03-15T15:00:00Z",
          patient: { name: "Alice", phone: "+1111" },
        };
      }
      return null;
    });

    const { POST } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        phone: "+1111",
        name: "Alice",
        appointmentDateTime: "2026-03-15T10:00:00Z",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.existingAppointment.id).toBe("appt_existing");
  });

  it("returns 500 when team hospital address is not configured", async () => {
    mockFetchQuery.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (Object.keys(args).length === 0) {
        return { userId: "u1", userEmail: "doc@clinic.com", teamId: "t1", teamName: "Clinic A" };
      }
      if ("teamId" in args) {
        return { timezone: "America/Phoenix", hospitalAddress: null };
      }
      if ("phone" in args && "userEmail" in args) {
        return null;
      }
      return null;
    });

    const { POST } = await import("../src/app/api/appointments/route");
    const req = new NextRequest("http://localhost:3000/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        phone: "+1111",
        name: "Alice",
        appointmentDateTime: "2026-03-15T10:00:00Z",
        skipExistingCheck: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/hospital address is not configured/i);
  });
});
