/**
 * Auth guard regression tests.
 *
 * Every API route must reject unauthenticated requests with 401
 * (or a safe fallback like { count: 0 } for polling endpoints).
 * These tests verify the AuthError path in each route file.
 */

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
  safeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: vi.fn(async () => null),
  fetchMutation: vi.fn(async () => null),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
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

vi.mock("@/lib/sms", () => ({
  getSMSProviderForTeam: vi.fn(),
  getDefaultSMSProvider: vi.fn(),
  resolveTemplatePlaceholders: vi.fn((body: string) => body),
}));

vi.mock("@/lib/webhook-utils", () => ({
  sendScheduleWebhook: vi.fn(),
  sendCancelWebhook: vi.fn(),
  formatAppointmentDateTime: vi.fn(() => ""),
}));

vi.mock("@/lib/appointments-integration", () => ({
  recordBookingConfirmationAndMaybeSuppress: vi.fn(),
  recordCancellationSmsAttempt: vi.fn(),
}));

vi.mock("@/lib/timezone-utils", () => ({
  convertComponentsToTimezoneUTC: vi.fn(() => "2026-03-15T15:00:00.000Z"),
  APPOINTMENT_TIMEZONE: "America/Los_Angeles",
  extractComponentsInTimezone: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));
});

describe("unauthenticated requests return 401", () => {
  it("GET /api/appointments -> 401", async () => {
    const { GET } = await import("../src/app/api/appointments/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/appointments"));
    expect(res.status).toBe(401);
  });

  it("POST /api/appointments -> 401", async () => {
    const { POST } = await import("../src/app/api/appointments/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/appointments", {
        method: "POST",
        body: JSON.stringify({ phone: "+1111" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/appointments/[id] -> 401", async () => {
    const { GET } = await import("../src/app/api/appointments/[id]/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/appointments/appt_1"),
      { params: { id: "appt_1" } }
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/appointments/[id] -> 401", async () => {
    const { DELETE } = await import("../src/app/api/appointments/[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/appointments/appt_1", { method: "DELETE" }),
      { params: { id: "appt_1" } }
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/patients -> 401", async () => {
    const { GET } = await import("../src/app/api/patients/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/patients"));
    expect(res.status).toBe(401);
  });

  it("POST /api/patients -> 401", async () => {
    const { POST } = await import("../src/app/api/patients/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/patients", {
        method: "POST",
        body: JSON.stringify({ name: "Alice", phone: "+1111" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /api/patients -> 401", async () => {
    const { PATCH } = await import("../src/app/api/patients/route");
    const res = await PATCH(
      new NextRequest("http://localhost:3000/api/patients", {
        method: "PATCH",
        body: JSON.stringify({ patientId: "p1", name: "Updated" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/patients -> 401", async () => {
    const { DELETE } = await import("../src/app/api/patients/route");
    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/patients?id=p1", { method: "DELETE" })
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/users -> 401", async () => {
    const { GET } = await import("../src/app/api/users/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/users"));
    expect(res.status).toBe(401);
  });

  it("GET /api/audit-logs -> 401", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/audit-logs"));
    expect(res.status).toBe(401);
  });

  it("GET /api/messages -> 401", async () => {
    const { GET } = await import("../src/app/api/messages/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/messages"));
    expect(res.status).toBe(401);
  });

  it("GET /api/messages/templates -> 401", async () => {
    const { GET } = await import("../src/app/api/messages/templates/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/messages/templates"));
    expect(res.status).toBe(401);
  });

  it("POST /api/messages/templates -> 401", async () => {
    const { POST } = await import("../src/app/api/messages/templates/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/messages/templates", {
        method: "POST",
        body: JSON.stringify({ name: "Test", body: "Hi", category: "general" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /api/messages/templates -> 401", async () => {
    const { PATCH } = await import("../src/app/api/messages/templates/route");
    const res = await PATCH(
      new NextRequest("http://localhost:3000/api/messages/templates", {
        method: "PATCH",
        body: JSON.stringify({ templateId: "tmpl_1", name: "Updated" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/messages/templates -> 401", async () => {
    const { DELETE } = await import("../src/app/api/messages/templates/route");
    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/messages/templates?templateId=tmpl_1", {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/reminder-attempts/[appointmentId] -> 401", async () => {
    const { GET } = await import(
      "../src/app/api/reminder-attempts/[appointmentId]/route"
    );
    const res = await GET(
      new NextRequest("http://localhost:3000/api/reminder-attempts/appt_1"),
      { params: { appointmentId: "appt_1" } }
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/messages/send -> 401", async () => {
    const { POST } = await import("../src/app/api/messages/send/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/messages/send", {
        method: "POST",
        body: JSON.stringify({ patientId: "p1", body: "hello" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("unread-count returns safe fallback instead of 401", () => {
  it("GET /api/messages/unread-count returns { count: 0 } when unauthenticated", async () => {
    const { GET } = await import("../src/app/api/messages/unread-count/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/messages/unread-count")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
  });
});
